import os
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient

# Use isolated temp database for tests
temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DB_PATH"] = temp_db.name

from database import init_db, get_board, save_board, INITIAL_BOARD_DATA
from main import app


@pytest.fixture(autouse=True)
def setup_test_database():
    init_db()
    save_board(INITIAL_BOARD_DATA, username="user")


@pytest.mark.asyncio
async def test_database_initialization():
    board = get_board("user")
    assert board is not None
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8
    assert "col-backlog" in [col["id"] for col in board["columns"]]


@pytest.mark.asyncio
async def test_get_board_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/board")
        assert response.status_code == 200
        data = response.json()
        assert "columns" in data
        assert "cards" in data
        assert len(data["columns"]) == 5


@pytest.mark.asyncio
async def test_put_board_endpoint_and_persistence():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Fetch current board
        get_res = await client.get("/api/board")
        board = get_res.json()

        # Rename first column
        board["columns"][0]["title"] = "Updated Backlog"

        # Add a new card
        board["cards"]["card-test-1"] = {
            "id": "card-test-1",
            "title": "Backend Test Card",
            "details": "Created via pytest",
        }
        board["columns"][0]["cardIds"].append("card-test-1")

        # Save via PUT
        put_res = await client.put("/api/board", json=board)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["columns"][0]["title"] == "Updated Backlog"
        assert "card-test-1" in updated["cards"]

        # Verify persistence on subsequent GET
        verify_res = await client.get("/api/board")
        assert verify_res.status_code == 200
        persisted = verify_res.json()
        assert persisted["columns"][0]["title"] == "Updated Backlog"
        assert "card-test-1" in persisted["cards"]


@pytest.mark.asyncio
async def test_put_board_invalid_schema():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        bad_payload = {"invalid_key": 123}
        response = await client.put("/api/board", json=bad_payload)
        assert response.status_code == 422
