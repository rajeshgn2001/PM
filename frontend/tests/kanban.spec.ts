import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/");
  const usernameInput = page.getByLabel(/username/i);
  if (await usernameInput.isVisible()) {
    await usernameInput.fill("user");
    await page.getByLabel(/password/i).fill("password");
    await page.getByRole("button", { name: /sign in/i }).click();
  }
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
};

test("requires login to access the kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  // Test failed login
  await page.getByLabel(/username/i).fill("wrong");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();

  // Test successful login
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  // Test sign out
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("loads the kanban board when authenticated", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const cardTitle = `Playwright Card ${Date.now()}`;
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(cardTitle);
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(cardTitle)).toBeVisible();
});

test("persists added cards across page reload", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const cardTitle = `Reload Persistence ${Date.now()}`;
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(cardTitle);
  await firstColumn.getByPlaceholder("Details").fill("Should survive reload.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(cardTitle)).toBeVisible();

  // Wait for debounced save to persist to SQLite backend
  await page.waitForTimeout(600);

  // Reload the browser page
  await page.reload();

  // Assert card is restored from backend
  await expect(firstColumn.getByText(cardTitle)).toBeVisible();
});

test("edits a card and persists the change", async ({ page }) => {
  await login(page);
  const card = page.getByTestId("card-card-2");
  await card.getByRole("button", { name: /^edit /i }).click();
  const newTitle = `Edited ${Date.now()}`;
  await card.getByLabel("Edit card title").fill(newTitle);
  await card.getByLabel("Edit card details").fill("Edited via e2e.");
  await card.getByRole("button", { name: /^save$/i }).click();
  await expect(card.getByText(newTitle)).toBeVisible();

  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId("card-card-2").getByText(newTitle)).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("opens and closes the AI assistant sidebar", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /ai assistant/i }).click();
  await expect(page.getByText("AI Project Assistant")).toBeVisible();
  await expect(
    page.getByPlaceholder(/ask ai to add, move, or edit cards/i)
  ).toBeVisible();

  // Close sidebar
  await page.getByRole("button", { name: /close assistant sidebar/i }).click();
  await expect(page.getByText("AI Project Assistant")).not.toBeVisible();
});

test("submits AI prompt and updates board in real time", async ({ page }) => {
  await login(page);

  // Intercept /api/ai/chat to return a structured update with an AI-created card
  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "I created the card AI Dynamic Card for you.",
        board_changed: true,
        board_update: {
          columns: [
            {
              id: "col-backlog",
              title: "Backlog",
              cardIds: ["card-1", "card-ai-dynamic"],
            },
            { id: "col-discovery", title: "Discovery", cardIds: [] },
            { id: "col-progress", title: "In Progress", cardIds: [] },
            { id: "col-review", title: "Review", cardIds: [] },
            { id: "col-done", title: "Done", cardIds: [] },
          ],
          cards: {
            "card-1": {
              id: "card-1",
              title: "Align roadmap themes",
              details: "Existing backlog task.",
            },
            "card-ai-dynamic": {
              id: "card-ai-dynamic",
              title: "AI Dynamic Card",
              details: "Rendered dynamically without page reload.",
            },
          },
        },
      }),
    });
  });

  // Open sidebar
  await page.getByRole("button", { name: /ai assistant/i }).click();
  await expect(page.getByText("AI Project Assistant")).toBeVisible();

  // Enter prompt and submit
  const input = page.getByPlaceholder(/ask ai to add, move, or edit cards/i);
  await input.fill("Add a card to Backlog named AI Dynamic Card");
  await page.getByRole("button", { name: /send/i }).click();

  // Assert AI response appears in chat
  await expect(
    page.getByText("I created the card AI Dynamic Card for you.")
  ).toBeVisible();

  // Assert board updated badge appears
  await expect(page.getByText("Board updated")).toBeVisible();

  // Assert card is rendered in Backlog without reload
  const backlogColumn = page.locator('[data-testid="column-col-backlog"]');
  await expect(backlogColumn.getByText("AI Dynamic Card")).toBeVisible();
});
