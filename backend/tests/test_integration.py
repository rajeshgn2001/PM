"""End-to-end API workflow across accounts, boards, the AI and persistence."""

import copy

from conftest import register, save_board, sign_in


async def test_full_project_workflow(client, monkeypatch):
    # Two people sign up; each starts with their own starter board.
    alice = await register(client, "alice", "alice-pass")
    bob = await register(client, "bob", "bob-pass")

    # Alice creates a second board and fills it in.
    sprint = (await client.post("/api/boards", headers=alice, json={"title": "Sprint 1"})).json()
    data = copy.deepcopy(sprint["data"])
    data["columns"].insert(1, {"id": "col-blocked", "title": "Blocked", "cardIds": ["card-a"]})
    data["cards"]["card-a"] = {"id": "card-a", "title": "Fix login", "details": "", "priority": "high", "dueDate": "2026-11-01"}
    assert (await save_board(client, alice, sprint["id"], data)).status_code == 200
    await client.patch(f"/api/boards/{sprint['id']}", headers=alice, json={"title": "Sprint 1 (active)"})

    # The AI moves the card to Done on that board.
    moved = copy.deepcopy(data)
    moved["columns"][1]["cardIds"] = []
    moved["columns"][-1]["cardIds"] = ["card-a"]

    async def fake_claude(prompt, system_prompt, json_schema=None):
        assert "Fix login" in system_prompt
        return {"structured_output": {"message": "Moved Fix login to Done.", "board_update": moved}}

    monkeypatch.setattr("ai.run_claude", fake_claude)
    chat = await client.post(f"/api/boards/{sprint['id']}/ai/chat", headers=alice, json={"message": "Finish Fix login"})
    assert chat.json()["board_changed"] is True

    # Alice signs in from a new session and sees everything persisted.
    await client.post("/api/auth/logout", headers=alice)
    alice = await sign_in(client, "alice", "alice-pass")
    boards = (await client.get("/api/boards", headers=alice)).json()
    assert [(b["title"], b["card_count"], b["open_card_count"]) for b in boards] == [
        ("My First Board", 0, 0),
        ("Sprint 1 (active)", 1, 0),
    ]
    saved = (await client.get(f"/api/boards/{sprint['id']}", headers=alice)).json()["data"]
    assert saved["columns"][-1]["cardIds"] == ["card-a"]
    assert saved["cards"]["card-a"]["dueDate"] == "2026-11-01"

    # Bob cannot see Alice's boards until she shares one.
    assert [b["title"] for b in (await client.get("/api/boards", headers=bob)).json()] == ["My First Board"]
    assert (await client.get(f"/api/boards/{sprint['id']}", headers=bob)).status_code == 404
    await client.post(f"/api/boards/{sprint['id']}/members", headers=alice, json={"username": "bob"})
    titles = [b["title"] for b in (await client.get("/api/boards", headers=bob)).json()]
    assert titles == ["My First Board", "Sprint 1 (active)"]

    # Bob picks up the card with a checklist; Alice sees it.
    board = (await client.get(f"/api/boards/{sprint['id']}", headers=bob)).json()
    card = board["data"]["cards"]["card-a"]
    card.update(assignee="bob", labels=["auth"], checklist=[{"id": "i1", "text": "Repro", "done": True}])
    assert (await save_board(client, bob, sprint["id"], board["data"], board["version"])).status_code == 200
    seen = (await client.get(f"/api/boards/{sprint['id']}", headers=alice)).json()["data"]["cards"]["card-a"]
    assert (seen["assignee"], seen["labels"], seen["checklist"][0]["done"]) == ("bob", ["auth"], True)

    # Alice deletes her account; her boards (including the shared one) and sessions go with it.
    await client.request("DELETE", "/api/auth/me", headers=alice, json={"password": "alice-pass"})
    assert (await client.get("/api/boards", headers=alice)).status_code == 401
    assert (await client.get(f"/api/boards/{sprint['id']}", headers=bob)).status_code == 404
    assert (await client.get("/api/auth/me", headers=bob)).json()["board_count"] == 1
