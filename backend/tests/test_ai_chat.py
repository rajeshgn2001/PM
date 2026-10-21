import pytest
from httpx import ASGITransport, AsyncClient
from database import get_board, init_db, save_board, INITIAL_BOARD_DATA
from main import app


@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    save_board(INITIAL_BOARD_DATA, username="user")


@pytest.mark.asyncio
async def test_ai_chat_informational(monkeypatch):
    async def mock_structured_chat(user_prompt: str, system_instruction: str, history=None):
        return {
            "message": "You currently have 5 columns and 8 active cards.",
            "board_update": None,
        }

    monkeypatch.setattr("main.generate_structured_chat", mock_structured_chat)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "message": "How many cards do I have?",
            "history": [],
        }
        response = await client.post("/api/ai/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["board_changed"] is False
        assert data["board_update"] is None
        assert "5 columns and 8 active cards" in data["message"]


@pytest.mark.asyncio
async def test_ai_chat_card_creation(monkeypatch):
    current = get_board("user")
    modified_board = dict(current)
    new_card_id = "card-ai-created"
    modified_board["cards"][new_card_id] = {
        "id": new_card_id,
        "title": "AI Task",
        "details": "Created by AI assistant",
    }
    modified_board["columns"][0]["cardIds"].append(new_card_id)

    async def mock_structured_chat(user_prompt: str, system_instruction: str, history=None):
        return {
            "message": "I added the 'AI Task' card to Backlog.",
            "board_update": modified_board,
        }

    monkeypatch.setattr("main.generate_structured_chat", mock_structured_chat)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "message": "Add a task named AI Task to Backlog",
            "history": [],
        }
        response = await client.post("/api/ai/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["board_changed"] is True
        assert data["board_update"] is not None
        assert new_card_id in data["board_update"]["cards"]

        # Verify persisted in database
        db_board = get_board("user")
        assert new_card_id in db_board["cards"]


@pytest.mark.asyncio
async def test_ai_chat_malformed_update_fallback(monkeypatch):
    async def mock_structured_chat(user_prompt: str, system_instruction: str, history=None):
        return {
            "message": "I tried to update the board but output malformed data.",
            "board_update": {"invalid": "not a valid BoardData schema"},
        }

    monkeypatch.setattr("main.generate_structured_chat", mock_structured_chat)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"message": "Corrupt the board", "history": []}
        response = await client.post("/api/ai/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["board_changed"] is False
        assert data["board_update"] is None
        assert "malformed" in data["message"]

        # Assert DB is still healthy
        db_board = get_board("user")
        assert len(db_board["columns"]) == 5
