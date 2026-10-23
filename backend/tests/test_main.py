import sqlite3

from conftest import register, sign_in
from database import DEMO_USERNAME, authenticate, get_db_path, hash_password, init_db, verify_password


async def test_health_endpoint(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_password_hashing_round_trip():
    stored = hash_password("s3cret")
    assert stored.startswith("scrypt$")
    assert stored != hash_password("s3cret")
    assert verify_password("s3cret", stored)
    assert not verify_password("wrong", stored)


def test_init_db_is_idempotent():
    init_db()
    init_db()
    with sqlite3.connect(get_db_path()) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1


def test_init_db_adds_version_column_to_legacy_boards():
    with sqlite3.connect(get_db_path()) as conn:
        conn.execute("ALTER TABLE boards DROP COLUMN version")
    init_db()
    with sqlite3.connect(get_db_path()) as conn:
        assert conn.execute("SELECT version FROM boards").fetchone()[0] == 1


def test_init_db_hashes_legacy_plaintext_passwords():
    with sqlite3.connect(get_db_path()) as conn:
        conn.execute("UPDATE users SET password_hash = 'password' WHERE username = ?", (DEMO_USERNAME,))
    init_db()
    assert authenticate(DEMO_USERNAME, "password") is not None


async def test_login_success(client):
    response = await client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "user"
    assert len(data["token"]) > 20


async def test_login_issues_distinct_tokens(client):
    assert await sign_in(client) != await sign_in(client)


async def test_login_failure(client):
    response = await client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


async def test_protected_endpoints_require_a_valid_token(client):
    assert (await client.get("/api/boards")).status_code == 401
    bad = {"Authorization": "Bearer not-a-real-token"}
    response = await client.get("/api/boards", headers=bad)
    assert response.status_code == 401
    assert "sign in again" in response.json()["detail"]


async def test_logout_invalidates_the_token(client, auth):
    assert (await client.post("/api/auth/logout", headers=auth)).status_code == 204
    assert (await client.get("/api/auth/me", headers=auth)).status_code == 401


async def test_register_creates_user_with_starter_board(client):
    headers = await register(client, "alice")
    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["username"] == "alice"
    assert me["board_count"] == 1
    boards = (await client.get("/api/boards", headers=headers)).json()
    assert [b["title"] for b in boards] == ["My First Board"]
    assert boards[0]["card_count"] == 0


async def test_register_rejects_duplicate_username(client):
    response = await client.post("/api/auth/register", json={"username": "user", "password": "another1"})
    assert response.status_code == 409


async def test_register_validates_input(client):
    for payload in [
        {"username": "ab", "password": "secret123"},
        {"username": "has space", "password": "secret123"},
        {"username": "bob", "password": "short"},
    ]:
        assert (await client.post("/api/auth/register", json=payload)).status_code == 422


async def test_change_password(client, auth):
    other_session = await sign_in(client)
    response = await client.put(
        "/api/auth/password",
        headers=auth,
        json={"current_password": "password", "new_password": "brand-new"},
    )
    assert response.status_code == 204
    # The current session stays signed in; every other session is revoked.
    assert (await client.get("/api/auth/me", headers=auth)).status_code == 200
    assert (await client.get("/api/auth/me", headers=other_session)).status_code == 401
    assert (await client.post("/api/auth/login", json={"username": "user", "password": "password"})).status_code == 401
    await sign_in(client, "user", "brand-new")


async def test_change_password_requires_current_password(client, auth):
    response = await client.put(
        "/api/auth/password",
        headers=auth,
        json={"current_password": "wrong", "new_password": "brand-new"},
    )
    assert response.status_code == 400
    await sign_in(client)


async def test_delete_account(client):
    headers = await register(client, "carol")
    wrong = await client.request("DELETE", "/api/auth/me", headers=headers, json={"password": "nope"})
    assert wrong.status_code == 400

    response = await client.request("DELETE", "/api/auth/me", headers=headers, json={"password": "secret123"})
    assert response.status_code == 204
    assert (await client.get("/api/boards", headers=headers)).status_code == 401
    login = await client.post("/api/auth/login", json={"username": "carol", "password": "secret123"})
    assert login.status_code == 401
    with sqlite3.connect(get_db_path()) as conn:
        assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1  # only the demo board
