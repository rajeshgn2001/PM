import pytest
from httpx import ASGITransport, AsyncClient

from database import DEMO_PASSWORD, DEMO_USERNAME, init_db
from main import app


@pytest.fixture(autouse=True)
def test_database(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    init_db()


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def sign_in(client: AsyncClient, username: str = DEMO_USERNAME, password: str = DEMO_PASSWORD) -> dict:
    response = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


async def register(client: AsyncClient, username: str, password: str = "secret123") -> dict:
    response = await client.post("/api/auth/register", json={"username": username, "password": password})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
async def auth(client) -> dict:
    """Authorization headers for the seeded demo user."""
    return await sign_in(client)


@pytest.fixture
async def demo_board_id(client, auth) -> int:
    return (await client.get("/api/boards", headers=auth)).json()[0]["id"]


async def save_board(client: AsyncClient, headers: dict, board_id: int, data: dict, version: int | None = None):
    """PUTs board data at the given version, or at the current version when omitted."""
    if version is None:
        version = (await client.get(f"/api/boards/{board_id}", headers=headers)).json()["version"]
    return await client.put(f"/api/boards/{board_id}", headers=headers, json={"version": version, "data": data})
