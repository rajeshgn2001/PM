import copy

from conftest import register, save_board
from database import INITIAL_BOARD_DATA


def fake_claude(structured_output, calls=None):
    async def run_claude(prompt, system_prompt, json_schema=None):
        if calls is not None:
            calls.append({"prompt": prompt, "system_prompt": system_prompt})
        return {"structured_output": structured_output}

    return run_claude


async def post_chat(client, headers, board_id, message, history=()):
    return await client.post(
        f"/api/boards/{board_id}/ai/chat",
        headers=headers,
        json={"message": message, "history": list(history)},
    )


async def test_ai_chat_informational(client, auth, demo_board_id, monkeypatch):
    calls = []
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "You have 8 cards.", "board_update": None}, calls))

    response = await post_chat(
        client, auth, demo_board_id, "How many cards do I have?",
        history=[{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello"}],
    )
    assert response.status_code == 200
    assert response.json() == {
        "message": "You have 8 cards.", "board_update": None, "board_changed": False, "version": 1,
    }
    assert '"Kanban Studio"' in calls[0]["system_prompt"]
    assert "board members: user" in calls[0]["system_prompt"]
    assert 'You are talking to user ("me" means user)' in calls[0]["system_prompt"]
    assert "Align roadmap themes" in calls[0]["system_prompt"]
    assert "User: Hi\n\nAssistant: Hello\n\nUser: How many cards do I have?" in calls[0]["prompt"]


async def test_ai_chat_card_creation_is_saved(client, auth, demo_board_id, monkeypatch):
    board = copy.deepcopy(INITIAL_BOARD_DATA)
    board["cards"]["card-ai"] = {"id": "card-ai", "title": "AI Task", "details": "", "priority": "high"}
    board["columns"][0]["cardIds"].append("card-ai")
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Added it.", "board_update": board}))

    response = await post_chat(client, auth, demo_board_id, "Add a high priority task named AI Task")
    assert response.status_code == 200
    assert response.json()["board_changed"] is True
    assert response.json()["version"] == 2

    saved = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert saved["cards"]["card-ai"]["priority"] == "high"


async def test_ai_chat_invalid_board_is_rejected(client, auth, demo_board_id, monkeypatch):
    board = copy.deepcopy(INITIAL_BOARD_DATA)
    board["columns"][0]["cardIds"].append("card-missing")
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Done.", "board_update": board}))

    response = await post_chat(client, auth, demo_board_id, "Break the board")
    assert response.status_code == 500
    assert "invalid board" in response.json()["detail"]
    saved = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert "card-missing" not in saved["columns"][0]["cardIds"]
    assert len(saved["cards"]) == 8


async def test_ai_chat_reports_cli_failure(client, auth, demo_board_id, monkeypatch):
    async def failing(prompt, system_prompt, json_schema=None):
        raise RuntimeError("AI request timed out after 120s")

    monkeypatch.setattr("ai.run_claude", failing)
    response = await post_chat(client, auth, demo_board_id, "Hello")
    assert response.status_code == 500
    assert response.json()["detail"] == "AI request timed out after 120s"


async def test_ai_chat_only_touches_the_selected_board(client, auth, demo_board_id, monkeypatch):
    other = (await client.post("/api/boards", headers=auth, json={"title": "Other"})).json()
    board = copy.deepcopy(other["data"])
    board["cards"]["card-ai"] = {"id": "card-ai", "title": "Only here", "details": ""}
    board["columns"][0]["cardIds"].append("card-ai")
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Added.", "board_update": board}))

    assert (await post_chat(client, auth, other["id"], "Add a card")).status_code == 200
    assert "card-ai" in (await client.get(f"/api/boards/{other['id']}", headers=auth)).json()["data"]["cards"]
    demo = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert "card-ai" not in demo["cards"]


async def test_ai_chat_requires_board_ownership(client, demo_board_id, monkeypatch):
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "x", "board_update": None}))
    intruder = await register(client, "eve")
    assert (await post_chat(client, intruder, demo_board_id, "Hi")).status_code == 404
    assert (await post_chat(client, {}, demo_board_id, "Hi")).status_code == 401


async def test_ai_chat_rejects_assignee_outside_the_board(client, auth, demo_board_id, monkeypatch):
    await register(client, "stranger")
    board = copy.deepcopy(INITIAL_BOARD_DATA)
    board["cards"]["card-1"]["assignee"] = "stranger"
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Assigned.", "board_update": board}))

    response = await post_chat(client, auth, demo_board_id, "Assign card-1 to stranger")
    assert response.status_code == 422
    assert response.json()["detail"] == "stranger is not a member of this board"


async def test_ai_chat_does_not_overwrite_edits_made_while_it_was_thinking(client, auth, demo_board_id, monkeypatch):
    ai_board = copy.deepcopy(INITIAL_BOARD_DATA)
    ai_board["columns"][0]["title"] = "AI edit"
    concurrent = copy.deepcopy(INITIAL_BOARD_DATA)
    concurrent["columns"][1]["title"] = "Teammate edit"

    async def slow_claude(prompt, system_prompt, json_schema=None):
        # A teammate saves while the AI request is in flight.
        assert (await save_board(client, auth, demo_board_id, concurrent, version=1)).status_code == 200
        return {"structured_output": {"message": "Renamed.", "board_update": ai_board}}

    monkeypatch.setattr("ai.run_claude", slow_claude)
    response = await post_chat(client, auth, demo_board_id, "Rename Backlog")
    assert response.status_code == 409
    saved = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert [c["title"] for c in saved["columns"][:2]] == ["Backlog", "Teammate edit"]


async def test_ai_chat_works_for_board_members(client, auth, demo_board_id, monkeypatch):
    member = await register(client, "bob")
    await client.post(f"/api/boards/{demo_board_id}/members", headers=auth, json={"username": "bob"})
    calls = []
    monkeypatch.setattr("ai.run_claude", fake_claude({"message": "Hi bob.", "board_update": None}, calls))
    assert (await post_chat(client, member, demo_board_id, "Hello")).status_code == 200
    assert "board members: user, bob" in calls[0]["system_prompt"]
    assert "You are talking to bob" in calls[0]["system_prompt"]
