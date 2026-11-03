import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "kanban.db"

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
DEFAULT_BOARD_TITLE = "Kanban Studio"
DEFAULT_GROUP_NAME = "DEFAULT"

INITIAL_BOARD_DATA = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}

# New boards start with a simple three-stage workflow and no cards.
EMPTY_BOARD_DATA = {
    "columns": [
        {"id": "col-todo", "title": "To Do", "cardIds": []},
        {"id": "col-progress", "title": "In Progress", "cardIds": []},
        {"id": "col-done", "title": "Done", "cardIds": []},
    ],
    "cards": {},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

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

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS board_members (
    board_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id, user_id),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);

CREATE TABLE IF NOT EXISTS board_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS board_placements (
    user_id INTEGER NOT NULL,
    board_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, board_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES board_groups(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_board_placements_board_id ON board_placements(board_id);
CREATE INDEX IF NOT EXISTS idx_board_placements_group_id ON board_placements(group_id);
"""


def get_db_path() -> Path:
    return Path(os.getenv("DB_PATH") or DEFAULT_DB_PATH)


@contextmanager
def connect():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return hmac.compare_digest(candidate.hex(), digest)


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)
        # Boards created before sharing have no version column for conflict detection.
        if "version" not in [row["name"] for row in conn.execute("PRAGMA table_info(boards)")]:
            conn.execute("ALTER TABLE boards ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
        # Databases from the MVP stored the seed password in plaintext.
        legacy = conn.execute("SELECT id, password_hash FROM users WHERE password_hash NOT LIKE 'scrypt$%'")
        for row in legacy.fetchall():
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(row["password_hash"]), row["id"]),
            )
        # Users from before groups existed get a default group, which holds all their boards.
        conn.execute(
            """
            INSERT INTO board_groups (user_id, name)
            SELECT u.id, ? FROM users u
            WHERE NOT EXISTS (SELECT 1 FROM board_groups g WHERE g.user_id = u.id)
            """,
            (DEFAULT_GROUP_NAME,),
        )
        if not conn.execute("SELECT 1 FROM users WHERE username = ?", (DEMO_USERNAME,)).fetchone():
            user_id = _insert_user(conn, DEMO_USERNAME, DEMO_PASSWORD)
            _insert_board(conn, user_id, DEFAULT_BOARD_TITLE, INITIAL_BOARD_DATA)


def _insert_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password)),
    )
    conn.execute("INSERT INTO board_groups (user_id, name) VALUES (?, ?)", (cursor.lastrowid, DEFAULT_GROUP_NAME))
    return cursor.lastrowid


def _insert_board(conn: sqlite3.Connection, user_id: int, title: str, data: dict) -> int:
    cursor = conn.execute(
        "INSERT INTO boards (user_id, title, data) VALUES (?, ?, ?)",
        (user_id, title, json.dumps(data)),
    )
    return cursor.lastrowid


# Users and sessions


def create_user(username: str, password: str) -> int | None:
    """Creates the user with a starter board. Returns None if the username is taken."""
    try:
        with connect() as conn:
            user_id = _insert_user(conn, username, password)
            _insert_board(conn, user_id, "My First Board", EMPTY_BOARD_DATA)
            return user_id
    except sqlite3.IntegrityError:
        return None


def authenticate(username: str, password: str) -> sqlite3.Row | None:
    with connect() as conn:
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user and verify_password(password, user["password_hash"]):
        return user
    return None


def update_password(user_id: int, new_password: str, keep_token: str):
    """Changes the password and signs out every other session of the user."""
    with connect() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user_id, keep_token))


def delete_user(user_id: int):
    with connect() as conn:
        username = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()[0]
        for row in conn.execute("SELECT board_id FROM board_members WHERE user_id = ?", (user_id,)).fetchall():
            _unassign(conn, row["board_id"], username)
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    return token


def get_session_user(token: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token,),
        ).fetchone()


def delete_session(token: str):
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


# Boards. A user can access a board they own or are a member of; access is checked
# through get_board / list_boards, the other functions act on an already-checked board.

ACCESSIBLE_BOARDS = """
SELECT b.id, b.title, b.data, b.version, b.created_at, b.updated_at, u.username AS owner,
       CASE WHEN b.user_id = :user_id THEN 'owner' ELSE 'member' END AS role
FROM boards b JOIN users u ON u.id = b.user_id
WHERE (b.user_id = :user_id
       OR EXISTS (SELECT 1 FROM board_members m WHERE m.board_id = b.id AND m.user_id = :user_id))
"""


def list_boards(user_id: int) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(ACCESSIBLE_BOARDS + " ORDER BY b.id", {"user_id": user_id}).fetchall()
        default_group = conn.execute("SELECT MIN(id) FROM board_groups WHERE user_id = ?", (user_id,)).fetchone()[0]
        placements = conn.execute("SELECT board_id, group_id FROM board_placements WHERE user_id = ?", (user_id,))
        group_of = {row["board_id"]: row["group_id"] for row in placements}
    return [{**_board_summary(row), "group_id": group_of.get(row["id"], default_group)} for row in rows]


def _board_summary(row: sqlite3.Row) -> dict:
    data = json.loads(row["data"])
    done = len(data["columns"][-1]["cardIds"])
    return {
        "id": row["id"],
        "title": row["title"],
        "role": row["role"],
        "owner": row["owner"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "card_count": len(data["cards"]),
        # Cards not in the last column, which counts as done.
        "open_card_count": len(data["cards"]) - done,
    }


def create_board(user_id: int, title: str, data: dict = EMPTY_BOARD_DATA) -> dict:
    with connect() as conn:
        board_id = _insert_board(conn, user_id, title, data)
    return get_board(user_id, board_id)


def get_board(user_id: int, board_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            ACCESSIBLE_BOARDS + " AND b.id = :board_id", {"user_id": user_id, "board_id": board_id}
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "title": row["title"],
        "role": row["role"],
        "owner": row["owner"],
        "version": row["version"],
        "data": json.loads(row["data"]),
    }


def save_board_data(board_id: int, data: dict, version: int) -> int | None:
    """Saves only if the board is still at `version`. Returns the new version, or None on conflict."""
    with connect() as conn:
        cursor = conn.execute(
            """
            UPDATE boards SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND version = ?
            """,
            (json.dumps(data), board_id, version),
        )
    return version + 1 if cursor.rowcount == 1 else None


def rename_board(board_id: int, title: str):
    with connect() as conn:
        conn.execute(
            "UPDATE boards SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (title, board_id),
        )


def delete_board(board_id: int):
    with connect() as conn:
        conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))


# Board groups. Each user organizes the boards they can access into their own groups.
# A user's oldest group is their default: it holds every board they have not placed elsewhere.


def list_groups(user_id: int) -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT id, name FROM board_groups WHERE user_id = ? ORDER BY id", (user_id,)).fetchall()
    return [dict(row) for row in rows]


def create_group(user_id: int, name: str) -> dict | None:
    """Returns None if the user already has a group with this name."""
    try:
        with connect() as conn:
            cursor = conn.execute("INSERT INTO board_groups (user_id, name) VALUES (?, ?)", (user_id, name))
            return {"id": cursor.lastrowid, "name": name}
    except sqlite3.IntegrityError:
        return None


def rename_group(user_id: int, group_id: int, name: str) -> str:
    """Returns "renamed", "unknown" (not this user's group) or "exists" (name already used)."""
    try:
        with connect() as conn:
            cursor = conn.execute(
                "UPDATE board_groups SET name = ? WHERE id = ? AND user_id = ?", (name, group_id, user_id)
            )
    except sqlite3.IntegrityError:
        return "exists"
    return "renamed" if cursor.rowcount == 1 else "unknown"


def move_board_to_group(user_id: int, board_id: int, group_id: int) -> bool:
    """Places an already-checked board in the user's group. False if the group is not theirs."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM board_groups WHERE id = ? AND user_id = ?", (group_id, user_id)).fetchone():
            return False
        conn.execute(
            """
            INSERT INTO board_placements (user_id, board_id, group_id) VALUES (?, ?, ?)
            ON CONFLICT (user_id, board_id) DO UPDATE SET group_id = excluded.group_id
            """,
            (user_id, board_id, group_id),
        )
    return True


# Board members


def list_members(board_id: int) -> list[dict]:
    """The owner first, then members in the order they were added."""
    with connect() as conn:
        owner = conn.execute(
            "SELECT u.username FROM boards b JOIN users u ON u.id = b.user_id WHERE b.id = ?", (board_id,)
        ).fetchone()
        members = conn.execute(
            """
            SELECT u.username FROM board_members m JOIN users u ON u.id = m.user_id
            WHERE m.board_id = ? ORDER BY m.rowid
            """,
            (board_id,),
        ).fetchall()
    return [{"username": owner["username"], "role": "owner"}] + [
        {"username": row["username"], "role": "member"} for row in members
    ]


def add_member(board_id: int, username: str) -> str:
    """Returns "added", "unknown" (no such user) or "exists" (already owner or member)."""
    with connect() as conn:
        user = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not user:
            return "unknown"
        owner_id = conn.execute("SELECT user_id FROM boards WHERE id = ?", (board_id,)).fetchone()[0]
        if user["id"] == owner_id:
            return "exists"
        try:
            conn.execute("INSERT INTO board_members (board_id, user_id) VALUES (?, ?)", (board_id, user["id"]))
        except sqlite3.IntegrityError:
            return "exists"
    return "added"


def remove_member(board_id: int, username: str) -> bool:
    """Removes a member and unassigns their cards on the board. False if they were not a member."""
    with connect() as conn:
        cursor = conn.execute(
            "DELETE FROM board_members WHERE board_id = ? AND user_id = (SELECT id FROM users WHERE username = ?)",
            (board_id, username),
        )
        if cursor.rowcount == 0:
            return False
        conn.execute(
            "DELETE FROM board_placements WHERE board_id = ? AND user_id = (SELECT id FROM users WHERE username = ?)",
            (board_id, username),
        )
        _unassign(conn, board_id, username)
    return True


def _unassign(conn: sqlite3.Connection, board_id: int, username: str):
    row = conn.execute("SELECT data FROM boards WHERE id = ?", (board_id,)).fetchone()
    data = json.loads(row["data"])
    cards = [card for card in data["cards"].values() if card.get("assignee") == username]
    if not cards:
        return
    for card in cards:
        card["assignee"] = None
    conn.execute(
        "UPDATE boards SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (json.dumps(data), board_id),
    )
