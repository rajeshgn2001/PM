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
│   ├── app/            # layout.tsx, page.tsx (auth gate, listens for AUTH_EXPIRED_EVENT), globals.css
│   ├── components/
│   │   ├── Workspace.tsx         # board list sidebar (owned and shared; create/rename/delete/switch), account chip, empty state
│   │   ├── BoardGroupSection.tsx # collapsible, renamable group (drop target) and draggable board row
│   │   ├── AccountDialog.tsx     # profile, change password, delete account
│   │   ├── KanbanBoard.tsx       # loads/saves one board (versioned, chained saves, conflict reload, idle polling when shared), stats, filters, DnD, columns, AI lock
│   │   ├── CardDialog.tsx        # edit all card fields: priority, due date, assignee, labels, checklist
│   │   ├── ShareDialog.tsx       # members list; owner invites/removes, members leave
│   │   ├── KanbanColumn.tsx      # droppable column with editable title and delete button
│   │   ├── KanbanCard.tsx        # draggable card; badges for labels, priority, due date, checklist, assignee
│   │   ├── KanbanCardPreview.tsx # drag overlay
│   │   ├── NewCardForm.tsx       # add-card form
│   │   ├── LoginForm.tsx         # sign in / create account
│   │   ├── Icons.tsx             # inline SVG icons
│   │   └── AIChatSidebar.tsx     # AI chat for the current board; reports busy state; shows server error detail
│   ├── lib/
│   │   ├── kanban.ts   # types, moveCard, matchesFilter, parseLabels, isOverdue, boardStats, createId
│   │   ├── api.ts      # authenticated fetch wrapper (throws ApiError with status) and all board/member/account/AI calls
│   │   └── auth.ts     # login, register, logout, token in sessionStorage
│   └── test/           # Vitest setup and auth fetch mock
└── tests/kanban.spec.ts  # Playwright E2E
```

## Data Model (`src/lib/kanban.ts`)

- `Card`: `id`, `title`, `details`, optional `priority` (`low`/`medium`/`high`), `dueDate` (`YYYY-MM-DD`), `assignee` (member username), `labels`, `checklist` (`{id, text, done}`)
- `Column`: `id`, `title`, `cardIds` (ordered)
- `BoardData`: `columns`, `cards` (map of id to card)
- `moveCard(columns, activeId, overId)`: pure reorder/move logic used by drag and drop.
- The last column counts as done: its cards are never shown as overdue and are excluded from open counts.

The backend enforces board integrity (see `docs/DATABASE.md`).

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

- Sign in or create an account; the session token is kept in sessionStorage (survives reloads, cleared when the tab closes) and sent as a Bearer header by `api.ts`. Any 401 clears it and returns to the sign-in form.
- The workspace lists owned and shared boards (shared ones show "Shared by <owner>"); the selected board is remembered for the session. Owners can create, rename and delete boards.
- Boards are listed under the user's groups. New boards go to the default group; "New group" adds one; the pencil on a group renames it; dragging a board onto a group moves it (rolled back with an error if the save fails); clicking a group header collapses it, remembered for the session. An open group shows up to 10 boards and scrolls beyond that; groups share the sidebar height when it runs short. Touch screens drag with a long press.
- Share / Members button opens `ShareDialog`; after a membership change the board reloads (removing a member unassigns their cards on the server).
- A board loads from `GET /api/boards/{id}`; a loading state, or an error with Retry, is shown until it loads.
- Drag and drop, column add/rename/delete, card add/edit (in `CardDialog`)/delete; each change is saved with a debounced `PUT /api/boards/{id}` carrying the last known version. A 409 reloads the board and shows a notice; other failures show "Sync error".
- Shared boards poll every `POLL_INTERVAL_MS` (10s) while idle and adopt a newer version.
- Search (title, details, labels), priority and assignee filters only change what is displayed, never the saved board.
- AI sidebar: scoped to the current board; while a request is in flight the board is `inert` so the AI's full-board reply cannot overwrite concurrent edits.

## Testing & Verification Commands

- `npm run test`: Vitest unit tests in `src/`; `npm run test:coverage` adds a coverage report.
- `npm run test:e2e`: Playwright E2E against a running app (see root `CLAUDE.md` for running against a throwaway container).
- `npm run lint`, `npm run build` (static export to `out/`).
