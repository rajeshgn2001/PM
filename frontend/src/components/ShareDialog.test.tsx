import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareDialog } from "@/components/ShareDialog";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({ addMember: vi.fn(), removeMember: vi.fn() }));

const members: api.Member[] = [
  { username: "alice", role: "owner" },
  { username: "bob", role: "member" },
];

const renderDialog = (role: api.Role, username: string) => {
  const props = { onMembersChange: vi.fn(), onLeave: vi.fn(), onClose: vi.fn() };
  render(<ShareDialog boardId={9} role={role} username={username} members={members} {...props} />);
  return props;
};

describe("ShareDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists members with their roles and marks the current user", () => {
    renderDialog("owner", "alice");
    const items = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["aalice (you)owner", "bbobmemberRemove"]);
  });

  it("lets the owner invite a member", async () => {
    const updated = [...members, { username: "carol", role: "member" as const }];
    vi.mocked(api.addMember).mockResolvedValue(updated);
    const { onMembersChange } = renderDialog("owner", "alice");
    await userEvent.type(screen.getByLabelText("Username to invite"), " carol {enter}");
    expect(api.addMember).toHaveBeenCalledWith(9, "carol");
    expect(onMembersChange).toHaveBeenCalledWith(updated);
    expect(screen.getByLabelText("Username to invite")).toHaveValue("");
  });

  it("shows why an invite failed", async () => {
    vi.mocked(api.addMember).mockRejectedValue(new Error("No user named ghost"));
    const { onMembersChange } = renderDialog("owner", "alice");
    await userEvent.type(screen.getByLabelText("Username to invite"), "ghost{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("No user named ghost");
    expect(onMembersChange).not.toHaveBeenCalled();
  });

  it("ignores an empty invite", async () => {
    renderDialog("owner", "alice");
    await userEvent.click(screen.getByRole("button", { name: /invite/i }));
    expect(api.addMember).not.toHaveBeenCalled();
  });

  it("lets the owner remove a member", async () => {
    vi.mocked(api.removeMember).mockResolvedValue(undefined);
    const { onMembersChange } = renderDialog("owner", "alice");
    await userEvent.click(screen.getByRole("button", { name: "Remove bob" }));
    expect(api.removeMember).toHaveBeenCalledWith(9, "bob");
    expect(onMembersChange).toHaveBeenCalledWith([members[0]]);
  });

  it("lets a member leave after confirming, but not invite or remove", async () => {
    vi.mocked(api.removeMember).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { onLeave, onClose } = renderDialog("member", "bob");
    expect(screen.queryByLabelText("Username to invite")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    expect(api.removeMember).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.removeMember).toHaveBeenCalledWith(9, "bob");
    expect(onLeave).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Close members" }));
    expect(onClose).toHaveBeenCalled();
  });
});
