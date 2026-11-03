import { expect, test, type Browser, type Page } from "@playwright/test";

const columns = (page: Page) => page.locator('[data-testid^="column-"]');
const boardNav = (page: Page) => page.getByRole("navigation", { name: "Boards" });
const boardButton = (page: Page, title: string) =>
  boardNav(page).getByRole("button", { name: title, exact: true });

const signIn = async (page: Page, username = "user", password = "password") => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(columns(page).first()).toBeVisible();
};

// Registers a fresh account so the test starts from a clean, isolated workspace.
const registerNewUser = async (page: Page, password = "secret123") => {
  const username = `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();
  return username;
};

const addCard = async (page: Page, columnIndex: number, title: string) => {
  const column = columns(page).nth(columnIndex);
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill(title);
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText(title)).toBeVisible();
};

// A second, independent browser session, as another person would have.
const newSession = async (browser: Browser) => (await browser.newContext()).newPage();

const shareCurrentBoard = async (page: Page, username: string) => {
  await page.getByRole("button", { name: "Share board" }).click();
  await page.getByLabel("Username to invite").fill(username);
  await page.getByRole("button", { name: /invite/i }).click();
  await expect(page.getByRole("list", { name: "Members" }).getByText(username)).toBeVisible();
  await page.getByRole("button", { name: "Close members" }).click();
};

// Board saves are debounced; wait until the save indicator clears.
const waitForSave = async (page: Page) => {
  await expect(page.getByText("Saving...")).toHaveCount(0);
};

test("requires login to access the kanban board", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();

  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio", level: 1 })).toBeVisible();
  await expect(columns(page)).toHaveCount(5);

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});

test("returns to sign in when the session is no longer valid", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => sessionStorage.setItem("kanban_auth_token", "revoked"));
  await page.reload();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});

test("persists added cards across page reload", async ({ page }) => {
  await signIn(page);
  const cardTitle = `Reload Persistence ${Date.now()}`;
  await addCard(page, 0, cardTitle);
  await waitForSave(page);
  await page.reload();
  await expect(columns(page).first().getByText(cardTitle)).toBeVisible();
});

test("edits a card's details in the card dialog and persists the change", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("card-card-2").getByRole("button", { name: /^edit /i }).click();
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  const newTitle = `Edited ${Date.now()}`;
  await dialog.getByLabel("Edit card title").fill(newTitle);
  await dialog.getByLabel("Edit card details").fill("Edited via e2e.");
  await dialog.getByLabel("Edit card priority").selectOption("high");
  await dialog.getByLabel("Edit card due date").fill("2020-02-03");
  await dialog.getByLabel("Edit card assignee").selectOption("user");
  await dialog.getByLabel("Edit card labels").fill("research, q4");
  await dialog.getByLabel("New checklist item").fill("Interview five customers");
  await dialog.getByLabel("New checklist item").press("Enter");
  await dialog.getByLabel("New checklist item").fill("Summarize findings");
  await dialog.getByLabel("New checklist item").press("Enter");
  await dialog.getByLabel("Interview five customers", { exact: true }).check();
  await dialog.getByRole("button", { name: /^save$/i }).click();

  const card = page.getByTestId("card-card-2");
  await expect(card.getByText(newTitle)).toBeVisible();
  await expect(card.getByTitle("Overdue")).toHaveText("Feb 3");
  await expect(card.getByTitle("Checklist")).toHaveText("1/2");

  await waitForSave(page);
  await page.reload();
  const reloaded = page.getByTestId("card-card-2");
  await expect(reloaded.getByText(newTitle)).toBeVisible();
  await expect(reloaded.getByText("high")).toBeVisible();
  await expect(reloaded.getByText("research")).toBeVisible();
  await expect(reloaded.getByTitle("Assigned to user")).toBeVisible();
  await expect(reloaded.getByTitle("Checklist")).toHaveText("1/2");
  await expect(page.getByTestId("board-stats")).toContainText("1 overdue");

  await page.getByLabel("Filter by assignee").selectOption({ label: "Assigned to me" });
  await expect(page.getByText("Showing 1 of")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();

  await waitForSave(page);
  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("new users get their own workspace, isolated from other users", async ({ page }) => {
  const username = await registerNewUser(page);
  await expect(page.getByText(username)).toBeVisible();
  await expect(columns(page)).toHaveCount(3);
  await expect(page.getByText("Align roadmap themes")).toHaveCount(0);

  await addCard(page, 0, "Private card");
  await waitForSave(page);
  await page.getByRole("button", { name: /sign out/i }).click();

  await signIn(page);
  await expect(page.getByText("Private card")).toHaveCount(0);
  await expect(boardButton(page, "My First Board")).toHaveCount(0);
});

test("registration rejects a taken username", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("secret123");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText("Username is already taken")).toBeVisible();
});

test("creates, switches, renames and deletes boards", async ({ page }) => {
  await registerNewUser(page);
  await addCard(page, 0, "First board card");
  await waitForSave(page);

  await boardNav(page).getByRole("button", { name: /new board/i }).click();
  await page.getByLabel("New board name").fill("Launch Plan");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("heading", { name: "Launch Plan" })).toBeVisible();
  await expect(page.getByText("First board card")).toHaveCount(0);
  await addCard(page, 1, "Launch card");
  await waitForSave(page);

  await boardButton(page, "My First Board").click();
  await expect(page.getByText("First board card")).toBeVisible();
  await expect(page.getByText("Launch card")).toHaveCount(0);

  await boardNav(page).getByRole("button", { name: "Rename board Launch Plan" }).click();
  await page.getByLabel("Board name").fill("Launch Q1");
  await page.getByLabel("Board name").press("Enter");
  await expect(boardButton(page, "Launch Q1")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();
  await boardButton(page, "Launch Q1").click();
  await expect(page.getByText("Launch card")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await boardNav(page).getByRole("button", { name: "Delete board Launch Q1" }).click();
  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();
  await page.reload();
  await expect(boardButton(page, "Launch Q1")).toHaveCount(0);
});

test("adds, renames and deletes columns", async ({ page }) => {
  await registerNewUser(page);
  await page.getByRole("button", { name: /add column/i }).click();
  await expect(columns(page)).toHaveCount(4);
  await columns(page).nth(3).getByLabel("Column title").fill("Blocked");
  await waitForSave(page);

  await page.getByRole("button", { name: "Delete column In Progress" }).click();
  await expect(columns(page)).toHaveCount(3);
  await waitForSave(page);
  await page.reload();
  await expect(columns(page)).toHaveCount(3);
  const titles = await columns(page).getByLabel("Column title").evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value)
  );
  expect(titles).toEqual(["To Do", "Done", "Blocked"]);
});

test("searches and filters cards", async ({ page }) => {
  await registerNewUser(page);
  await addCard(page, 0, "Write release notes");
  await addCard(page, 0, "Fix payment bug");
  await page.getByLabel("Search cards").fill("payment");
  await expect(page.getByText("Fix payment bug")).toBeVisible();
  await expect(page.getByText("Write release notes")).toHaveCount(0);
  await expect(page.getByText("Showing 1 of 2 cards")).toBeVisible();
  await page.getByRole("button", { name: /clear filters/i }).click();
  await expect(page.getByText("Write release notes")).toBeVisible();
});

test("changes the password and deletes the account", async ({ page }) => {
  const username = await registerNewUser(page, "first-pass");
  await page.getByRole("button", { name: "Account settings" }).click();
  await expect(page.getByRole("dialog")).toContainText(`Signed in as ${username}`);
  await page.getByLabel("Current password").fill("first-pass");
  await page.getByLabel("New password").fill("second-pass");
  await page.getByRole("button", { name: /update password/i }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Password updated");
  await page.getByRole("button", { name: "Close account settings" }).click();
  await page.getByRole("button", { name: /sign out/i }).click();

  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill("first-pass");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await signIn(page, username, "second-pass");

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByLabel("Confirm with your password").fill("second-pass");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /^delete account$/i }).click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill("second-pass");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("opens and closes the AI assistant sidebar", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /ai assistant/i }).click();
  await expect(page.getByText("AI Project Assistant")).toBeVisible();
  await page.getByRole("button", { name: /close assistant sidebar/i }).click();
  await expect(page.getByText("AI Project Assistant")).not.toBeVisible();
});

test("submits AI prompt and updates the current board in real time", async ({ page }) => {
  await registerNewUser(page);

  await page.route("**/api/boards/*/ai/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "I created the card AI Dynamic Card for you.",
        board_changed: true,
        board_update: {
          columns: [
            { id: "col-todo", title: "To Do", cardIds: ["card-ai-dynamic"] },
            { id: "col-progress", title: "In Progress", cardIds: [] },
            { id: "col-done", title: "Done", cardIds: [] },
          ],
          cards: {
            "card-ai-dynamic": {
              id: "card-ai-dynamic",
              title: "AI Dynamic Card",
              details: "Rendered without page reload.",
              priority: "high",
              dueDate: null,
            },
          },
        },
      }),
    });
  });

  await page.getByRole("button", { name: /ai assistant/i }).click();
  await page.getByPlaceholder(/ask ai to add, move, or edit cards/i).fill("Add AI Dynamic Card");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("I created the card AI Dynamic Card for you.")).toBeVisible();
  await expect(page.getByText("Board updated")).toBeVisible();
  const todo = page.getByTestId("column-col-todo");
  await expect(todo.getByText("AI Dynamic Card")).toBeVisible();
  await expect(todo.getByText("high")).toBeVisible();
});

test("owners share boards with teammates who can edit and be assigned cards", async ({ page, browser }) => {
  const owner = await registerNewUser(page);
  await addCard(page, 0, "Shared task");
  await waitForSave(page);

  const teammatePage = await newSession(browser);
  const teammate = await registerNewUser(teammatePage);
  await shareCurrentBoard(page, teammate);

  // The teammate sees the shared board, marked with its owner, without owner-only actions.
  await teammatePage.reload();
  await expect(teammatePage.getByText(`Shared by ${owner}`)).toBeVisible();
  await boardNav(teammatePage).getByRole("button", { name: new RegExp(`Shared by ${owner}`) }).click();
  await expect(teammatePage.getByText("Shared task")).toBeVisible();
  await expect(teammatePage.getByRole("button", { name: "Board members" })).toBeVisible();
  await expect(boardNav(teammatePage).getByRole("button", { name: /^Rename board/ })).toHaveCount(1);

  // The teammate assigns the card to themselves; the owner sees it without reloading.
  await teammatePage.getByRole("button", { name: "Edit Shared task", exact: true }).click();
  await teammatePage.getByLabel("Edit card assignee").selectOption(teammate);
  await teammatePage.getByRole("button", { name: /^save$/i }).click();
  await waitForSave(teammatePage);
  await expect(page.getByTitle(`Assigned to ${teammate}`)).toBeVisible({ timeout: 15_000 });

  // Removing the teammate unassigns the card and revokes access.
  await page.getByRole("button", { name: "Share board" }).click();
  await page.getByRole("button", { name: `Remove ${teammate}` }).click();
  await page.getByRole("button", { name: "Close members" }).click();
  await expect(page.getByTitle(`Assigned to ${teammate}`)).toHaveCount(0);
  await teammatePage.reload();
  await expect(teammatePage.getByText(`Shared by ${owner}`)).toHaveCount(0);
});

test("concurrent edits to a shared board are not silently overwritten", async ({ page, browser }) => {
  await registerNewUser(page);
  const teammatePage = await newSession(browser);
  const teammate = await registerNewUser(teammatePage);
  await shareCurrentBoard(page, teammate);
  await teammatePage.reload();
  await boardNav(teammatePage).getByRole("button", { name: /Shared by/ }).click();
  await expect(columns(teammatePage)).toHaveCount(3);

  // Both have the same version loaded; the owner saves first.
  await addCard(page, 0, "Owner card");
  await waitForSave(page);
  await addCard(teammatePage, 1, "Teammate card");

  await expect(teammatePage.getByText(/your last change was not saved/)).toBeVisible();
  await expect(teammatePage.getByText("Owner card")).toBeVisible();
  await expect(teammatePage.getByText("Teammate card")).toHaveCount(0);

  // After the reload the teammate's next change saves normally.
  await addCard(teammatePage, 1, "Teammate retry");
  await waitForSave(teammatePage);
  await page.reload();
  await expect(page.getByText("Owner card")).toBeVisible();
  await expect(page.getByText("Teammate retry")).toBeVisible();
});

test("members can leave a shared board", async ({ page, browser }) => {
  await registerNewUser(page);
  const teammatePage = await newSession(browser);
  const teammate = await registerNewUser(teammatePage);
  await shareCurrentBoard(page, teammate);

  await teammatePage.reload();
  await boardNav(teammatePage).getByRole("button", { name: /Shared by/ }).click();
  await teammatePage.getByRole("button", { name: "Board members" }).click();
  teammatePage.once("dialog", (dialog) => dialog.accept());
  await teammatePage.getByRole("button", { name: /leave board/i }).click();
  await expect(boardNav(teammatePage).getByText(/Shared by/)).toHaveCount(0);
  await expect(teammatePage.getByRole("heading", { name: "My First Board" })).toBeVisible();
});

test("sharing with an unknown user explains the problem", async ({ page }) => {
  await registerNewUser(page);
  await page.getByRole("button", { name: "Share board" }).click();
  await page.getByLabel("Username to invite").fill("no-such-user-xyz");
  await page.getByRole("button", { name: /invite/i }).click();
  await expect(page.getByText("No user named no-such-user-xyz")).toBeVisible();
});

test("organizes boards into groups by dragging, and keeps them after a reload", async ({ page }) => {
  await registerNewUser(page);
  const group = (name: string) => page.getByRole("region", { name: `Group ${name}` });
  await expect(group("DEFAULT").getByRole("button", { name: "My First Board", exact: true })).toBeVisible();

  await boardNav(page).getByRole("button", { name: /new group/i }).click();
  await page.getByLabel("New group name").fill("Work");
  await page.getByLabel("New group name").press("Enter");
  await expect(group("Work")).toBeVisible();

  const row = group("DEFAULT").getByRole("button", { name: "My First Board", exact: true });
  const rowBox = await row.boundingBox();
  const targetBox = await group("Work").boundingBox();
  if (!rowBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(group("Work").getByRole("button", { name: "My First Board", exact: true })).toBeVisible();
  await expect(group("DEFAULT").getByRole("button", { name: "My First Board", exact: true })).toHaveCount(0);

  await boardNav(page).getByRole("button", { name: "Rename group DEFAULT", exact: true }).click();
  await page.getByLabel("Group name").fill("Personal");
  await page.getByLabel("Group name").press("Enter");
  await expect(group("Personal")).toBeVisible();

  await page.reload();
  await expect(group("Work").getByRole("button", { name: "My First Board", exact: true })).toBeVisible();
  await expect(group("Personal")).toBeVisible();

  // Collapsing hides the group's boards and clicking again brings them back.
  await boardNav(page).getByRole("button", { name: "Work", exact: true }).click();
  await expect(boardButton(page, "My First Board")).toHaveCount(0);
  await boardNav(page).getByRole("button", { name: "Work", exact: true }).click();
  await expect(boardButton(page, "My First Board")).toBeVisible();
});

test("returns a board to its group and explains when a move fails", async ({ page }) => {
  await registerNewUser(page);
  const group = (name: string) => page.getByRole("region", { name: `Group ${name}` });
  await boardNav(page).getByRole("button", { name: /new group/i }).click();
  await page.getByLabel("New group name").fill("Work");
  await page.getByLabel("New group name").press("Enter");
  await expect(group("Work")).toBeVisible();
  await page.route("**/api/boards/*/group", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Group not found"}' })
  );

  const rowBox = await group("DEFAULT").getByRole("button", { name: "My First Board", exact: true }).boundingBox();
  const targetBox = await group("Work").boundingBox();
  if (!rowBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(boardNav(page).getByRole("alert")).toHaveText("Group not found");
  await expect(group("DEFAULT").getByRole("button", { name: "My First Board", exact: true })).toBeVisible();
});

test.describe("with more boards than the sidebar can show", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  const group = (page: Page, name: string) => page.getByRole("region", { name: `Group ${name}` });
  const boardsOf = (page: Page, name: string) => group(page, name).locator('[data-testid^="group-boards-"]');

  // Registers a user with many boards in DEFAULT, plus a second group holding one board.
  const setUp = async (page: Page) => {
    await registerNewUser(page);
    await page.evaluate(async () => {
      const headers = {
        Authorization: `Bearer ${sessionStorage.getItem("kanban_auth_token")}`,
        "Content-Type": "application/json",
      };
      const post = (path: string, body: unknown) =>
        fetch(path, { method: "POST", headers, body: JSON.stringify(body) }).then((response) => response.json());
      for (let i = 1; i <= 20; i++) {
        await post("/api/boards", { title: `Board ${i}` });
      }
      const work = await post("/api/groups", { name: "Work" });
      const parked = await post("/api/boards", { title: "Parked" });
      await fetch(`/api/boards/${parked.id}/group`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ group_id: work.id }),
      });
    });
    await page.reload();
    await expect(group(page, "Work")).toBeVisible();
  };

  test("each group scrolls on its own and every group stays in view", async ({ page }) => {
    await setUp(page);
    await expect(boardNav(page).getByRole("button", { name: "DEFAULT", exact: true })).toBeInViewport();
    await expect(boardNav(page).getByRole("button", { name: "Work", exact: true })).toBeInViewport();
    await expect(boardButton(page, "Parked")).toBeInViewport();
    await expect(boardNav(page).getByRole("button", { name: /new group/i })).toBeInViewport();

    const overflows = (locator: ReturnType<typeof boardsOf>) =>
      locator.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(await overflows(boardsOf(page, "DEFAULT"))).toBe(true);
    expect(await overflows(boardsOf(page, "Work"))).toBe(false);
    // Nothing is left for a shared scrollbar to do.
    const list = boardsOf(page, "DEFAULT").locator("xpath=../..");
    expect(await overflows(list)).toBe(false);

    // Scrolling one group leaves the other where it was.
    const workTop = (await group(page, "Work").boundingBox())?.y;
    await boardButton(page, "Board 20").scrollIntoViewIfNeeded();
    await expect(boardButton(page, "Board 20")).toBeInViewport();
    expect((await group(page, "Work").boundingBox())?.y).toBe(workTop);
  });

  test("moves a board pulled from far down a long group, and back up", async ({ page }) => {
    await setUp(page);
    const pull = async (title: string, target: string) => {
      const row = boardButton(page, title);
      await row.scrollIntoViewIfNeeded();
      const rowBox = await row.boundingBox();
      const targetBox = await group(page, target).boundingBox();
      if (!rowBox || !targetBox) {
        throw new Error("Unable to resolve drag coordinates.");
      }
      await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 10, { steps: 12 });
      await page.mouse.up();
      await expect(group(page, target).getByRole("button", { name: title, exact: true })).toHaveCount(1);
    };

    await pull("Board 18", "Work");
    await pull("Parked", "DEFAULT");
    await page.reload();
    await expect(group(page, "Work").getByRole("button", { name: "Board 18", exact: true })).toHaveCount(1);
    await expect(group(page, "DEFAULT").getByRole("button", { name: "Parked", exact: true })).toHaveCount(1);
  });
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("moves a board with a long press and pull", async ({ page }) => {
    await registerNewUser(page);
    const group = (name: string) => page.getByRole("region", { name: `Group ${name}` });
    await boardNav(page).getByRole("button", { name: /new group/i }).click();
    await page.getByLabel("New group name").fill("Work");
    await page.getByLabel("New group name").press("Enter");
    await expect(group("Work")).toBeVisible();

    const rowBox = await boardButton(page, "My First Board").boundingBox();
    const targetBox = await group("Work").boundingBox();
    if (!rowBox || !targetBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }
    const from = { x: rowBox.x + rowBox.width / 2, y: rowBox.y + rowBox.height / 2 };
    const to = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

    await touch("touchStart", [from]);
    await page.waitForTimeout(400);
    for (let step = 1; step <= 10; step++) {
      await touch("touchMove", [
        { x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 },
      ]);
    }
    await touch("touchEnd", []);
    await expect(group("Work").getByRole("button", { name: "My First Board", exact: true })).toBeVisible();
  });
});

test.describe("in a window shorter than the page", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("keeps the page still during a pull, so a small empty group can be hit", async ({ page }) => {
    await registerNewUser(page);
    // A tall board makes the page scrollable, and many boards fill the group being pulled from.
    await page.evaluate(async () => {
      const headers = {
        Authorization: `Bearer ${sessionStorage.getItem("kanban_auth_token")}`,
        "Content-Type": "application/json",
      };
      const boards = await fetch("/api/boards", { headers }).then((response) => response.json());
      const current = await fetch(`/api/boards/${boards[0].id}`, { headers }).then((response) => response.json());
      const ids = Array.from({ length: 12 }, (_, i) => `card-${i}`);
      current.data.columns[0].cardIds = ids;
      current.data.cards = Object.fromEntries(ids.map((id) => [id, { id, title: id, details: "" }]));
      await fetch(`/api/boards/${current.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ version: current.version, data: current.data }),
      });
      for (let i = 1; i <= 16; i++) {
        await fetch("/api/boards", { method: "POST", headers, body: JSON.stringify({ title: `Board ${i}` }) });
      }
      await fetch("/api/groups", { method: "POST", headers, body: JSON.stringify({ name: "Work" }) });
    });
    await page.reload();
    const group = page.getByRole("region", { name: "Group Work" });
    await expect(group).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);

    const rowBox = await boardButton(page, "Board 2").boundingBox();
    const targetBox = await group.boundingBox();
    if (!rowBox || !targetBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }
    await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.mouse.up();
    await expect(group.getByRole("button", { name: "Board 2", exact: true })).toBeVisible();
  });
});

test.describe("in a tall window", () => {
  test.use({ viewport: { width: 1366, height: 1100 } });

  // How many of the group's boards are fully visible without scrolling.
  const visibleBoards = (page: Page, name: string) =>
    page
      .getByRole("region", { name: `Group ${name}` })
      .locator('[data-testid^="group-boards-"]')
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return [...element.children].filter((row) => {
          const rowBox = row.getBoundingClientRect();
          return rowBox.top >= box.top && rowBox.bottom <= box.bottom;
        }).length;
      });

  test("a group fits its boards up to 10, and collapsing gives the others room", async ({ page }) => {
    await registerNewUser(page);
    await page.evaluate(async () => {
      const headers = {
        Authorization: `Bearer ${sessionStorage.getItem("kanban_auth_token")}`,
        "Content-Type": "application/json",
      };
      const post = (path: string, body: unknown) =>
        fetch(path, { method: "POST", headers, body: JSON.stringify(body) }).then((response) => response.json());
      const place = (boardId: number, groupId: number) =>
        fetch(`/api/boards/${boardId}/group`, { method: "PUT", headers, body: JSON.stringify({ group_id: groupId }) });
      for (let i = 1; i <= 14; i++) {
        await post("/api/boards", { title: `Board ${i}` });
      }
      const small = await post("/api/groups", { name: "Small" });
      for (let i = 1; i <= 3; i++) {
        await place((await post("/api/boards", { title: `Small ${i}` })).id, small.id);
      }
      const large = await post("/api/groups", { name: "Large" });
      for (let i = 1; i <= 14; i++) {
        await place((await post("/api/boards", { title: `Large ${i}` })).id, large.id);
      }
    });
    await page.reload();
    await expect(page.getByRole("region", { name: "Group Large" })).toBeVisible();
    const toggle = (name: string) => boardNav(page).getByRole("button", { name, exact: true });

    // The small group always shows all its boards.
    expect(await visibleBoards(page, "Small")).toBe(3);

    // With the other long group collapsed, a long group shows exactly 10.
    await toggle("DEFAULT").click();
    expect(await visibleBoards(page, "Large")).toBe(10);
    expect(await visibleBoards(page, "Small")).toBe(3);

    await toggle("Large").click();
    await toggle("DEFAULT").click();
    expect(await visibleBoards(page, "DEFAULT")).toBe(10);
    await boardButton(page, "Board 14").scrollIntoViewIfNeeded();
    await expect(boardButton(page, "Board 14")).toBeInViewport();

    // Group names are bold.
    const weight = await toggle("DEFAULT").getByText("DEFAULT").evaluate((name) => getComputedStyle(name).fontWeight);
    expect(weight).toBe("700");
  });
});

test.describe("with many groups in a short window", () => {
  test.use({ viewport: { width: 1366, height: 650 } });

  test("an open group still shows 10 boards, and a group below the window can be reached", async ({ page }) => {
    await registerNewUser(page);
    await page.evaluate(async () => {
      const headers = {
        Authorization: `Bearer ${sessionStorage.getItem("kanban_auth_token")}`,
        "Content-Type": "application/json",
      };
      const post = (path: string, body: unknown) =>
        fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
      for (let i = 1; i <= 15; i++) {
        await post("/api/boards", { title: `Board ${i}` });
      }
      for (let i = 1; i <= 8; i++) {
        await post("/api/groups", { name: `Team ${i}` });
      }
    });
    await page.reload();
    const target = page.getByRole("region", { name: "Group Team 8" });
    await expect(target).toBeAttached();

    const boards = page.getByRole("region", { name: "Group DEFAULT" }).locator('[data-testid^="group-boards-"]');
    const visible = () =>
      boards.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return [...element.children].filter((row) => {
          const rowBox = row.getBoundingClientRect();
          return rowBox.top >= box.top && rowBox.bottom <= box.bottom;
        }).length;
      });
    expect(await visible()).toBe(10);

    // Clicking the group closed and open again brings back the same 10.
    const toggle = boardNav(page).getByRole("button", { name: "DEFAULT", exact: true });
    await toggle.click();
    await toggle.click();
    expect(await visible()).toBe(10);

    // Hold at the window's bottom edge until the page has brought the group into view, then drop on it.
    const rowBox = await boardButton(page, "Board 2").boundingBox();
    if (!rowBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }
    await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rowBox.x + rowBox.width / 2, 645, { steps: 12 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY))
      .toBeLessThanOrEqual(1);
    const targetBox = await target.boundingBox();
    if (!targetBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(target.getByRole("button", { name: "Board 2", exact: true })).toBeVisible();
  });
});
