import copy

import pytest

from conftest import register, save_board
from database import EMPTY_BOARD_DATA, INITIAL_BOARD_DATA


async def test_demo_user_has_seeded_board(client, auth):
    boards = (await client.get("/api/boards", headers=auth)).json()
    assert len(boards) == 1
    assert boards[0]["title"] == "Kanban Studio"
    assert boards[0]["card_count"] == 8
    assert (boards[0]["role"], boards[0]["owner"]) == ("owner", "user")

    board = (await client.get(f"/api/boards/{boards[0]['id']}", headers=auth)).json()
    assert [c["id"] for c in board["data"]["columns"]][0] == "col-backlog"
    assert len(board["data"]["cards"]) == 8
    assert board["version"] == 1
    assert board["data"]["cards"]["card-1"]["priority"] is None


async def test_create_board(client, auth):
    response = await client.post("/api/boards", headers=auth, json={"title": "  Launch plan  "})
    assert response.status_code == 201
    board = response.json()
    assert board["title"] == "Launch plan"
    assert board["data"] == EMPTY_BOARD_DATA
    titles = [b["title"] for b in (await client.get("/api/boards", headers=auth)).json()]
    assert titles == ["Kanban Studio", "Launch plan"]


async def test_create_board_requires_title(client, auth):
    assert (await client.post("/api/boards", headers=auth, json={"title": ""})).status_code == 422


async def test_save_board_persists_cards_and_fields(client, auth, demo_board_id):
    data = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    data["columns"][0]["title"] = "Updated Backlog"
    data["cards"]["card-new"] = {
        "id": "card-new",
        "title": "New card",
        "details": "",
        "priority": "high",
        "dueDate": "2026-12-01",
    }
    data["columns"][0]["cardIds"].append("card-new")

    response = await save_board(client, auth, demo_board_id, data)
    assert response.status_code == 200

    persisted = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert persisted["columns"][0]["title"] == "Updated Backlog"
    assert persisted["cards"]["card-new"]["priority"] == "high"
    assert persisted["cards"]["card-new"]["dueDate"] == "2026-12-01"


async def test_save_board_supports_adding_and_removing_columns(client, auth, demo_board_id):
    data = copy.deepcopy(INITIAL_BOARD_DATA)
    data["columns"].append({"id": "col-blocked", "title": "Blocked", "cardIds": []})
    data["columns"] = [c for c in data["columns"] if c["id"] != "col-review"]
    del data["cards"]["card-6"]

    assert (await save_board(client, auth, demo_board_id, data)).status_code == 200
    persisted = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert [c["id"] for c in persisted["columns"]] == [
        "col-backlog", "col-discovery", "col-progress", "col-done", "col-blocked"
    ]


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda b: b["columns"][0]["cardIds"].append("card-missing"),
        lambda b: b["columns"][1]["cardIds"].append("card-1"),
        lambda b: b["columns"][0]["cardIds"].remove("card-1"),
        lambda b: b["columns"].append({"id": "col-backlog", "title": "Dup", "cardIds": []}),
        lambda b: b.update(columns=[], cards={}),
        lambda b: b["cards"]["card-1"].update(id="card-x"),
        lambda b: b["cards"]["card-1"].update(priority="urgent"),
        lambda b: b["cards"]["card-1"].update(dueDate="next week"),
        lambda b: b["cards"]["card-1"].update(labels=["x" * 31]),
        lambda b: b["cards"]["card-1"].update(labels=[" "]),
        lambda b: b["cards"]["card-1"].update(checklist=[{"id": "i1", "text": ""}]),
        lambda b: b["cards"]["card-1"].update(assignee="nobody"),
    ],
    ids=[
        "dangling-card-id", "duplicate-card", "orphan-card", "duplicate-column",
        "no-columns", "key-mismatch", "bad-priority", "bad-due-date",
        "long-label", "blank-label", "empty-checklist-item", "non-member-assignee",
    ],
)
async def test_save_board_rejects_invalid_board(client, auth, demo_board_id, corrupt):
    board = copy.deepcopy(INITIAL_BOARD_DATA)
    corrupt(board)
    response = await save_board(client, auth, demo_board_id, board)
    assert response.status_code == 422
    persisted = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]
    assert len(persisted["cards"]) == 8


async def test_rename_board(client, auth, demo_board_id):
    response = await client.patch(f"/api/boards/{demo_board_id}", headers=auth, json={"title": "Roadmap"})
    assert response.status_code == 200
    assert response.json()["title"] == "Roadmap"
    assert (await client.get("/api/boards", headers=auth)).json()[0]["title"] == "Roadmap"


async def test_delete_board(client, auth, demo_board_id):
    assert (await client.delete(f"/api/boards/{demo_board_id}", headers=auth)).status_code == 204
    assert (await client.get("/api/boards", headers=auth)).json() == []
    assert (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).status_code == 404


async def test_users_cannot_access_each_others_boards(client, auth, demo_board_id):
    intruder = await register(client, "mallory")
    url = f"/api/boards/{demo_board_id}"
    assert (await client.get(url, headers=intruder)).status_code == 404
    assert (await save_board(client, intruder, demo_board_id, EMPTY_BOARD_DATA, version=1)).status_code == 404
    assert (await client.patch(url, headers=intruder, json={"title": "Mine"})).status_code == 404
    assert (await client.delete(url, headers=intruder)).status_code == 404
    assert [b["title"] for b in (await client.get("/api/boards", headers=intruder)).json()] == ["My First Board"]

    owner_view = (await client.get(url, headers=auth)).json()
    assert owner_view["title"] == "Kanban Studio"
    assert len(owner_view["data"]["cards"]) == 8


async def test_unknown_board_returns_404(client, auth):
    assert (await client.get("/api/boards/9999", headers=auth)).status_code == 404


async def test_save_board_persists_assignee_labels_and_checklist(client, auth, demo_board_id):
    data = copy.deepcopy(INITIAL_BOARD_DATA)
    data["cards"]["card-1"].update(
        assignee="user",
        labels=[" design ", "q4"],
        checklist=[{"id": "i1", "text": "Draft", "done": True}, {"id": "i2", "text": "Review"}],
    )
    assert (await save_board(client, auth, demo_board_id, data)).status_code == 200
    card = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["data"]["cards"]["card-1"]
    assert card["assignee"] == "user"
    assert card["labels"] == ["design", "q4"]
    assert card["checklist"] == [
        {"id": "i1", "text": "Draft", "done": True},
        {"id": "i2", "text": "Review", "done": False},
    ]


async def test_save_increments_version_and_rejects_stale_writes(client, auth, demo_board_id):
    first = await save_board(client, auth, demo_board_id, INITIAL_BOARD_DATA, version=1)
    assert first.json() == {"version": 2}

    changed = copy.deepcopy(INITIAL_BOARD_DATA)
    changed["columns"][0]["title"] = "Stale edit"
    stale = await save_board(client, auth, demo_board_id, changed, version=1)
    assert stale.status_code == 409
    assert "changed by someone else" in stale.json()["detail"]
    board = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()
    assert board["version"] == 2
    assert board["data"]["columns"][0]["title"] == "Backlog"
