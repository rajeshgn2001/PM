# Database Architecture & Schema Specification

This document defines the SQLite database design for the Kanban Studio project management application.

---

## 1. Overview & Storage Strategy

- **Database Engine**: SQLite 3
- **File Location**: `DB_PATH` if set, else `backend/kanban.db`. In Docker, `DB_PATH=/data/kanban.db` on the `kanban-data` named volume, so the board survives restarts. Created on startup if missing.
- **Design Pattern**: Hybrid Relational + Document storage. User identity and board metadata are relational; Kanban board contents (columns, cards, and ordering) are stored as JSON in a single `data` column.
- **Rationale**:
  - High read/write throughput without complex multi-table joins or cascading updates when moving cards.
  - Matches the frontend `@dnd-kit` data representation directly (`BoardData`).
  - Seamlessly integrates with LLM Structured Outputs, which produce and consume entire board snapshots or deltas.
  - Relational users, sessions and boards: each user owns any number of boards.

---

## 2. Table Definitions

### 2.1 `users` Table

Stores registered user accounts and credentials.

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

#### Columns
- `id`: Unique integer identifier.
- `username`: Unique username (e.g., `user`).
- `password_hash`: `scrypt$<salt hex>$<digest hex>` (stdlib `hashlib.scrypt`, n=2^14, r=8, p=1). Databases from the MVP stored the plaintext seed value; `init_db()` rehashes any value without the `scrypt$` prefix.
- `created_at`: Account creation timestamp.

---

### 2.2 `sessions` Table

One row per signed-in session. The token is returned by login/register and sent as `Authorization: Bearer <token>`.

```sql
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
```

- `token`: `secrets.token_urlsafe(32)`.
- Deleted on logout; a password change deletes all of the user's other sessions.

---

### 2.3 `board_members` Table

Users other than the owner who can open and edit a board.

```sql
CREATE TABLE IF NOT EXISTS board_members (
    board_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id, user_id),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);
```

- The owner is `boards.user_id` and is never a row here.
- Removing a member (or deleting their account) sets `assignee` to null on their cards in that board.

---

### 2.4 `boards` Table

Stores each user's Kanban boards (any number per user) with JSON-serialized board state.

```sql
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'Kanban Studio',
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1,  -- added by ALTER TABLE on older databases
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
```

#### Columns
- `id`: Unique board integer identifier.
- `user_id`: The owner; foreign key referencing `users(id)`.
- `title`: Human-readable board title.
- `data`: Complete JSON string serialized according to the `BoardData` specification below.
- `created_at`: Timestamp when the board was created.
- `updated_at`: Timestamp of the latest modification.
- `version`: Incremented on every data write. Writes are `UPDATE ... WHERE id = ? AND version = ?`, so a client saving a stale copy changes nothing and gets 409.

---

## 3. JSON `data` Schema (`BoardData`)

The `data` column stores valid JSON adhering to the following structure:

```json
{
  "columns": [
    {
      "id": "col-backlog",
      "title": "Backlog",
      "cardIds": ["card-1", "card-2"]
    },
    {
      "id": "col-discovery",
      "title": "Discovery",
      "cardIds": ["card-3"]
    },
    {
      "id": "col-progress",
      "title": "In Progress",
      "cardIds": ["card-4", "card-5"]
    },
    {
      "id": "col-review",
      "title": "Review",
      "cardIds": ["card-6"]
    },
    {
      "id": "col-done",
      "title": "Done",
      "cardIds": ["card-7", "card-8"]
    }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Align roadmap themes",
      "details": "Draft quarterly themes with impact statements and metrics."
    },
    "card-2": {
      "id": "card-2",
      "title": "Gather customer signals",
      "details": "Review support tags, sales notes, and churn feedback."
    }
  }
}
```

### Type Definitions (Python Pydantic & TypeScript)

```python
class Card(BaseModel):
  id: str
  title: str
  details: str = ""
  priority: Literal["low", "medium", "high"] | None = None
  dueDate: date | None = None  # stored as "YYYY-MM-DD"
  assignee: str | None = None  # must be the owner or a member
  labels: list[str] = []  # up to 10, each 1-30 characters after trimming
  checklist: list[ChecklistItem] = []  # {id, text (1-200 chars), done}


class Column(BaseModel):
  id: str
  title: str
  cardIds: list[str]


class BoardData(BaseModel):
  columns: list[Column]  # at least one
  cards: dict[str, Card]
```

---

### Integrity rules (enforced by `BoardData` validation)

Every write (`PUT /api/boards/{id}` and AI updates) is rejected with 422 (or a 500 for AI replies) unless:
- There is at least one column and column IDs are unique (columns can be added, removed, renamed and reordered).
- Every card appears in exactly one column's `cardIds`, and every `cardIds` entry exists in `cards`.
- Each `cards` key equals that card's `id`.
- `priority` is `low`, `medium`, `high` or null, and `dueDate` is a valid ISO date or null.

- Every `assignee` is the owner or a member of the board (checked by the API, 422 otherwise).

Older boards without the newer card fields load unchanged; they default to null or empty lists.

---

## 4. Initialization & Seed Data

On application startup, `init_db()` runs `CREATE TABLE IF NOT EXISTS` and seeds only what is missing:
1. Creates tables and indexes (adds `sessions` and `board_members` to older databases) and adds `boards.version` if missing.
2. Rehashes any legacy plaintext password.
3. If the `user` account does not exist, creates it (password `password`) with the `Kanban Studio` board: 5 columns (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`) and 8 cards.

New accounts created through `POST /api/auth/register` get one board, `My First Board`, with columns `To Do`, `In Progress`, `Done` and no cards. `POST /api/boards` creates the same empty layout.

---

## 5. API Interaction Pattern

A user can access a board they own or are a member of (`ACCESSIBLE_BOARDS` query); any other board ID behaves as not found (404).

- `GET /api/boards`: lists owned and shared boards with title, role, owner, timestamps and card count.
- `GET /api/boards/{id}`: returns `{id, title, role, owner, version, data}`.
- `PUT /api/boards/{id}`: body `{version, data}`; validates `BoardData` and assignees, then writes only if `version` still matches and returns the new version (409 otherwise).
- `PATCH /api/boards/{id}`: updates `title` and `updated_at`.
- `DELETE /api/boards/{id}`: deletes the row.
- `GET/POST/DELETE /api/boards/{id}/members...`: read and change `board_members`.
- `DELETE /api/auth/me`: deletes the user; their boards, memberships and sessions go with it via `ON DELETE CASCADE` (`PRAGMA foreign_keys = ON` is set on every connection).
