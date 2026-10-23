"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/Icons";
import { addMember, removeMember, type Member, type Role } from "@/lib/api";

type ShareDialogProps = {
  boardId: number;
  role: Role;
  username: string;
  members: Member[];
  onMembersChange: (members: Member[]) => void;
  onLeave: () => void;
  onClose: () => void;
};

export const ShareDialog = ({
  boardId,
  role,
  username,
  members,
  onMembersChange,
  onLeave,
  onClose,
}: ShareDialogProps) => {
  const [invitee, setInvitee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isOwner = role === "owner";

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitee.trim()) {
      return;
    }
    return run(async () => {
      onMembersChange(await addMember(boardId, invitee.trim()));
      setInvitee("");
    });
  };

  const handleRemove = (member: string) =>
    run(async () => {
      await removeMember(boardId, member);
      onMembersChange(members.filter((m) => m.username !== member));
    });

  const handleLeave = () => {
    if (!window.confirm("Leave this board? You will lose access until the owner shares it again.")) {
      return;
    }
    return run(async () => {
      await removeMember(boardId, username);
      onLeave();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/30 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-full max-w-md space-y-5 rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="share-title" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              Board members
            </h2>
            <p className="mt-1 text-xs text-[var(--gray-text)]">
              Members can edit cards and columns. Only the owner can rename, delete or share the board.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            aria-label="Close members"
          >
            <CloseIcon />
          </button>
        </div>

        <ul className="space-y-2" aria-label="Members">
          {members.map((member) => (
            <li key={member.username} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--navy-dark)] text-xs font-semibold uppercase text-white">
                {member.username.charAt(0)}
              </span>
              <span className="flex-1 text-sm font-medium text-[var(--navy-dark)]">
                {member.username}
                {member.username === username && <span className="text-[var(--gray-text)]"> (you)</span>}
              </span>
              <span className="text-xs capitalize text-[var(--gray-text)]">{member.role}</span>
              {isOwner && member.role === "member" && (
                <button
                  type="button"
                  onClick={() => handleRemove(member.username)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                  aria-label={`Remove ${member.username}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        {isOwner ? (
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              value={invitee}
              onChange={(event) => setInvitee(event.target.value)}
              placeholder="Username"
              aria-label="Username to invite"
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110"
            >
              Invite
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleLeave}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 hover:bg-red-100"
          >
            Leave board
          </button>
        )}
      </div>
    </div>
  );
};
