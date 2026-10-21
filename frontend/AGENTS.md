# Frontend Overview

This document describes the existing frontend codebase in `frontend/`.

## Architecture & Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI Library**: React 19
- **Drag and Drop**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- **Styling**: Tailwind CSS v4 with custom CSS variables matching project brand colors
- **Unit Testing**: Vitest + React Testing Library + jsdom
- **E2E Testing**: Playwright

## Directory Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── globals.css      # CSS variables and base Tailwind styling
│   │   ├── layout.tsx       # Root HTML shell and font definitions
│   │   └── page.tsx         # Root page rendering <KanbanBoard />
│   ├── components/
│   │   ├── KanbanBoard.tsx  # Main board orchestrator, state holder, and DnD context
│   │   ├── KanbanColumn.tsx # Droppable column component with editable title and card list
│   │   ├── KanbanCard.tsx   # Draggable sortable card item with removal button
│   │   ├── KanbanCardPreview.tsx # Drag overlay preview rendered while dragging
│   │   ├── NewCardForm.tsx  # Form component to append cards to a column
│   │   └── KanbanBoard.test.tsx # Vitest component tests
│   ├── lib/
│   │   ├── kanban.ts        # Data types, initial demo data, and pure reordering logic
│   │   └── kanban.test.ts   # Unit tests for reordering logic
│   └── test/
│       └── setup.ts         # Jest DOM matchers setup for Vitest
├── tests/
│   └── kanban.spec.ts       # Playwright end-to-end tests
├── package.json
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
└── playwright.config.ts
```

## Data Model (`src/lib/kanban.ts`)

- `Card`:
  - `id`: unique card identifier string (`card-xxx`)
  - `title`: short title string
  - `details`: descriptive text string
- `Column`:
  - `id`: unique column identifier string (`col-xxx`)
  - `title`: column header title string
  - `cardIds`: string array maintaining the ordered card IDs for that column
- `BoardData`:
  - `columns`: array of `Column` objects
  - `cards`: normalized map `Record<string, Card>`
- `moveCard(columns, activeId, overId)`: Pure function computing the new column and card ordering when dragging within or between columns.
- `initialData`: Seed data containing 5 standard columns (Backlog, Discovery, In Progress, Review, Done) and 8 cards.

## UI Design Tokens & Theme (`src/app/globals.css`)

Colors mapped to the project guidelines:
- Accent Yellow: `#ecad0a` (`--accent-yellow`)
- Blue Primary: `#209dd7` (`--primary-blue`)
- Purple Secondary: `#753991` (`--secondary-purple`)
- Dark Navy: `#032147` (`--navy-dark`)
- Gray Text: `#888888` (`--gray-text`)
- Surface: `#f7f8fb` (`--surface`)
- Surface Strong: `#ffffff` (`--surface-strong`)

## Current Functionality

- Single board view with 5 columns.
- Drag-and-drop card reordering within a column and moving between columns using `@dnd-kit`.
- In-place column title editing.
- Adding cards to any column with title and description.
- Deleting cards from a column.
- Note: Current state is in-memory React state (`useState`) without persistence.

## Testing & Verification Commands

- `npm run test` or `npm run test:unit`: Executes Vitest unit tests in `src/`.
- `npm run test:e2e`: Executes Playwright end-to-end tests.
- `npm run lint`: Runs ESLint checks.
- `npm run build`: Generates Next.js build.

## Roadmap for Integration

1. **Static Export**: Configure `output: "export"` in `next.config.ts` so FastAPI can serve the generated static assets from `/`.
2. **Authentication Flow**: Add login gate checking credentials (`user` / `password`) and session management.
3. **Backend Persistence**: Replace in-memory `initialData` with REST API calls (`GET /api/board`, `PUT /api/board`) connected to the FastAPI backend.
4. **AI Sidebar Integration**: Add chat drawer component connected to the backend AI endpoint for conversational updates to the board.
