import json
import os
import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "kanban.db"

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


def get_db_path() -> Path:
    env_path = os.getenv("DB_PATH")
    if env_path:
        return Path(env_path)
    return DEFAULT_DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);"
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT 'Kanban Studio',
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);"
    )

    # Seed default user if not exists
    cursor.execute("SELECT id FROM users WHERE username = ?", ("user",))
    user_row = cursor.fetchone()
    if not user_row:
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("user", "password"),
        )
        user_id = cursor.lastrowid
    else:
        user_id = user_row["id"]

    # Seed initial board if not exists
    cursor.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,))
    board_row = cursor.fetchone()
    if not board_row:
        cursor.execute(
            "INSERT INTO boards (user_id, title, data) VALUES (?, ?, ?)",
            (user_id, "Kanban Studio", json.dumps(INITIAL_BOARD_DATA)),
        )

    conn.commit()
    conn.close()


def get_board(username: str = "user") -> dict | None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT b.data FROM boards b
        JOIN users u ON u.id = b.user_id
        WHERE u.username = ?
        LIMIT 1
        """,
        (username,),
    )
    row = cursor.fetchone()
    conn.close()
    if row and row["data"]:
        return json.loads(row["data"])
    return None


def save_board(data: dict, username: str = "user") -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user_row = cursor.fetchone()
    if not user_row:
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, "password"),
        )
        user_id = cursor.lastrowid
    else:
        user_id = user_row["id"]

    serialized = json.dumps(data)
    cursor.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,))
    board_row = cursor.fetchone()

    if board_row:
        cursor.execute(
            """
            UPDATE boards
            SET data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (serialized, board_row["id"]),
        )
    else:
        cursor.execute(
            "INSERT INTO boards (user_id, title, data) VALUES (?, ?, ?)",
            (user_id, "Kanban Studio", serialized),
        )

    conn.commit()
    conn.close()
    return data
