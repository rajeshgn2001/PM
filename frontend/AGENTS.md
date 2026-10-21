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
│   ├── app/            # layout.tsx, page.tsx (login gate), globals.css
│   ├── components/
│   │   ├── KanbanBoard.tsx       # loads/saves board, DnD context, AI lock, edit/add/delete handlers
│   │   ├── KanbanColumn.tsx      # droppable column with editable title
│   │   ├── KanbanCard.tsx        # draggable card with inline edit and remove
│   │   ├── KanbanCardPreview.tsx # drag overlay
│   │   ├── NewCardForm.tsx       # add-card form
│   │   ├── LoginForm.tsx         # sign-in form
│   │   └── AIChatSidebar.tsx     # AI chat; reports busy state; shows server error detail
│   ├── lib/
│   │   ├── kanban.ts   # types, moveCard (pure), createId
│   │   ├── api.ts      # fetchBoard, saveBoard, sendChatMessage
│   │   └── auth.ts     # login via POST /api/auth/login, token in sessionStorage
│   └── test/           # Vitest setup and fetch mock
└── tests/kanban.spec.ts  # Playwright E2E
```

## Data Model (`src/lib/kanban.ts`)

- `Card`: `id`, `title`, `details`
- `Column`: `id`, `title`, `cardIds` (ordered)
- `BoardData`: `columns`, `cards` (map of id to card)
- `moveCard(columns, activeId, overId)`: pure reorder/move logic used by drag and drop.

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

- Sign in against the backend; session kept in sessionStorage (survives reloads, cleared when the tab or browser closes).
- Board loads from `GET /api/board`; a loading state, or an error with Retry, is shown until it loads (no demo data fallback).
- Drag and drop, column rename, add, inline edit, and delete; each change is saved with a debounced `PUT /api/board`. A failed save shows "Sync error".
- AI sidebar: while a request is in flight the board is `inert` (locked) so the AI's full-board reply cannot overwrite concurrent edits.

## Testing & Verification Commands

- `npm run test`: Vitest unit tests in `src/`.
- `npm run test:e2e`: Playwright E2E against a running app (see root `CLAUDE.md` for running against a throwaway container).
- `npm run lint`, `npm run build` (static export to `out/`).
