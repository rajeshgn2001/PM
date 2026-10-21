import copy
import pytest
from httpx import ASGITransport, AsyncClient
from database import get_board, INITIAL_BOARD_DATA
from main import app


def fake_claude(structured_output):
    async def run_claude(prompt, system_prompt, json_schema=None):
        return {"structured_output": structured_output}

    return run_claude


async def post_chat(message: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/ai/chat", json={"message": message, "history": []})


@pytest.mark.asyncio
async def test_ai_chat_informational(monkeypatch):
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "You have 8 cards.", "board_update": None}))

    response = await post_chat("How many cards do I have?")
    assert response.status_code == 200
    data = response.json()
    assert data["board_changed"] is False
    assert data["board_update"] is None
    assert data["message"] == "You have 8 cards."


@pytest.mark.asyncio
async def test_ai_chat_card_creation(monkeypatch):
    board = copy.deepcopy(INITIAL_BOARD_DATA)
    board["cards"]["card-ai"] = {"id": "card-ai", "title": "AI Task", "details": "Created by AI"}
    board["columns"][0]["cardIds"].append("card-ai")
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Added it.", "board_update": board}))

    response = await post_chat("Add a task named AI Task to Backlog")
    assert response.status_code == 200
    data = response.json()
    assert data["board_changed"] is True
    assert "card-ai" in data["board_update"]["cards"]
    assert "card-ai" in get_board("user")["cards"]


@pytest.mark.asyncio
async def test_ai_chat_invalid_board_is_rejected(monkeypatch):
    board = copy.deepcopy(INITIAL_BOARD_DATA)
    board["columns"][0]["cardIds"].append("card-missing")
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Done.", "board_update": board}))

    response = await post_chat("Break the board")
    assert response.status_code == 500
    assert "invalid board" in response.json()["detail"]
    assert get_board("user") == INITIAL_BOARD_DATA
