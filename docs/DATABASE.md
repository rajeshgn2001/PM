# Database Architecture & Schema Specification

This document defines the SQLite database design for the Project Management MVP web application.

---

## 1. Overview & Storage Strategy

- **Database Engine**: SQLite 3
- **File Location**: `DB_PATH` if set, else `backend/kanban.db`. In Docker, `DB_PATH=/data/kanban.db` on the `kanban-data` named volume, so the board survives restarts. Created on startup if missing.
- **Design Pattern**: Hybrid Relational + Document storage. User identity and board metadata are relational; Kanban board contents (columns, cards, and ordering) are stored as JSON in a single `data` column.
- **Rationale**:
  - High read/write throughput without complex multi-table joins or cascading updates when moving cards.
  - Matches the frontend `@dnd-kit` data representation directly (`BoardData`).
  - Seamlessly integrates with LLM Structured Outputs, which produce and consume entire board snapshots or deltas.
  - Full relational support for multiple users in future iterations.

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
- `password_hash`: For the MVP this stores the plaintext seed value `password` and is not read; login is checked against hardcoded credentials in `backend/main.py`.
- `created_at`: Account creation timestamp.

---

### 2.2 `boards` Table

Stores the Kanban board record per user with JSON-serialized board state.

```sql
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'Kanban Studio',
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
```

#### Columns
- `id`: Unique board integer identifier.
- `user_id`: Foreign key referencing `users(id)`.
- `title`: Human-readable board title.
- `data`: Complete JSON string serialized according to the `BoardData` specification below.
- `created_at`: Timestamp when the board was created.
- `updated_at`: Timestamp of the latest modification.

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
  details: str


class Column(BaseModel):
  id: str
  title: str
  cardIds: list[str]


class BoardData(BaseModel):
  columns: list[Column]
  cards: dict[str, Card]
```

---

### Integrity rules (enforced by `BoardData` validation)

Every write (`PUT /api/board` and AI updates) is rejected with 422 (or a 500 for AI replies) unless:
- The columns are exactly `col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`, in that order (titles may change).
- Every card appears in exactly one column's `cardIds`, and every `cardIds` entry exists in `cards`.
- Each `cards` key equals that card's `id`.

---

## 4. Initialization & Seed Data

On application startup, `init_db()` runs `CREATE TABLE IF NOT EXISTS` and seeds only what is missing:
1. Executes `CREATE TABLE` and `CREATE INDEX` queries.
2. Inserts default user:
   - `username`: `user`
   - `password_hash`: `password`
3. Inserts default board:
   - `user_id`: ID of the newly created `user`
   - `title`: `Kanban Studio`
   - `data`: Initial JSON payload containing the 5 standard columns and 8 default cards.

---

## 5. API Interaction Pattern

- `GET /api/board`: Fetches the board row where `user_id = current_user.id`, parses `data` JSON, and returns it.
- `PUT /api/board`: Validates incoming JSON payload against `BoardData` schema, updates `data` and `updated_at = CURRENT_TIMESTAMP` for `user_id = current_user.id`.

---

## 6. Future Multi-User Compatibility

- The database schema is fully relational with foreign keys.
- Multiple users can register in `users` and have their own distinct board records in `boards`.
- The design supports multiple boards per user in the future by adding board management routes without breaking existing data structures.
