import copy

import pytest

from conftest import register, save_board
from database import INITIAL_BOARD_DATA


@pytest.fixture
async def bob(client) -> dict:
    return await register(client, "bob")


async def share(client, headers, board_id, username):
    return await client.post(f"/api/boards/{board_id}/members", headers=headers, json={"username": username})


async def get_data(client, headers, board_id) -> dict:
    return (await client.get(f"/api/boards/{board_id}", headers=headers)).json()["data"]


async def test_owner_shares_board_and_member_can_edit(client, auth, bob, demo_board_id):
    response = await share(client, auth, demo_board_id, " bob ")
    assert response.status_code == 201
    assert response.json() == [{"username": "user", "role": "owner"}, {"username": "bob", "role": "member"}]

    boards = (await client.get("/api/boards", headers=bob)).json()
    shared = next(b for b in boards if b["id"] == demo_board_id)
    assert (shared["role"], shared["owner"], shared["card_count"]) == ("member", "user", 8)

    data = await get_data(client, bob, demo_board_id)
    data["cards"]["card-1"]["assignee"] = "bob"
    assert (await save_board(client, bob, demo_board_id, data)).status_code == 200
    assert (await get_data(client, auth, demo_board_id))["cards"]["card-1"]["assignee"] == "bob"
    assert (await client.get("/api/auth/me", headers=bob)).json()["board_count"] == 2


async def test_member_list_is_visible_to_members(client, auth, bob, demo_board_id):
    await register(client, "carol")
    await share(client, auth, demo_board_id, "bob")
    await share(client, auth, demo_board_id, "carol")
    members = (await client.get(f"/api/boards/{demo_board_id}/members", headers=bob)).json()
    assert [m["username"] for m in members] == ["user", "bob", "carol"]


@pytest.mark.parametrize(
    "username, status, detail",
    [("ghost", 404, "No user named ghost"), ("user", 409, "user already has access")],
)
async def test_share_rejects_unknown_users_and_the_owner(client, auth, demo_board_id, username, status, detail):
    response = await share(client, auth, demo_board_id, username)
    assert response.status_code == status
    assert response.json()["detail"] == detail


async def test_share_rejects_duplicates(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    assert (await share(client, auth, demo_board_id, "bob")).status_code == 409


async def test_only_the_owner_manages_the_board(client, auth, bob, demo_board_id):
    await register(client, "carol")
    await share(client, auth, demo_board_id, "bob")
    url = f"/api/boards/{demo_board_id}"
    assert (await share(client, bob, demo_board_id, "carol")).status_code == 403
    assert (await client.patch(url, headers=bob, json={"title": "Mine"})).status_code == 403
    assert (await client.delete(url, headers=bob)).status_code == 403
    assert (await client.delete(f"{url}/members/user", headers=bob)).status_code == 403
    assert (await client.get(url, headers=auth)).json()["title"] == "Kanban Studio"


async def test_non_members_cannot_see_members(client, demo_board_id):
    outsider = await register(client, "eve")
    assert (await client.get(f"/api/boards/{demo_board_id}/members", headers=outsider)).status_code == 404
    assert (await share(client, outsider, demo_board_id, "eve")).status_code == 404


async def test_member_can_leave(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    assert (await client.delete(f"/api/boards/{demo_board_id}/members/bob", headers=bob)).status_code == 204
    assert (await client.get(f"/api/boards/{demo_board_id}", headers=bob)).status_code == 404
    assert demo_board_id not in [b["id"] for b in (await client.get("/api/boards", headers=bob)).json()]


async def test_owner_removes_member_and_their_cards_are_unassigned(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    data = copy.deepcopy(INITIAL_BOARD_DATA)
    data["cards"]["card-1"]["assignee"] = "bob"
    data["cards"]["card-2"]["assignee"] = "user"
    await save_board(client, auth, demo_board_id, data)
    version = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["version"]

    assert (await client.delete(f"/api/boards/{demo_board_id}/members/bob", headers=auth)).status_code == 204
    board = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()
    assert board["data"]["cards"]["card-1"]["assignee"] is None
    assert board["data"]["cards"]["card-2"]["assignee"] == "user"
    assert board["version"] == version + 1
    assert (await client.delete(f"/api/boards/{demo_board_id}/members/bob", headers=auth)).status_code == 404


async def test_removing_a_member_without_assignments_keeps_the_version(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    await client.delete(f"/api/boards/{demo_board_id}/members/bob", headers=auth)
    assert (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()["version"] == 1


async def test_deleting_an_account_unassigns_it_on_shared_boards(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    data = copy.deepcopy(INITIAL_BOARD_DATA)
    data["cards"]["card-3"]["assignee"] = "bob"
    await save_board(client, auth, demo_board_id, data)

    await client.request("DELETE", "/api/auth/me", headers=bob, json={"password": "secret123"})
    assert (await get_data(client, auth, demo_board_id))["cards"]["card-3"]["assignee"] is None
    members = (await client.get(f"/api/boards/{demo_board_id}/members", headers=auth)).json()
    assert [m["username"] for m in members] == ["user"]


async def test_owner_deleting_board_removes_member_access(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    await client.delete(f"/api/boards/{demo_board_id}", headers=auth)
    assert (await client.get(f"/api/boards/{demo_board_id}", headers=bob)).status_code == 404


async def test_concurrent_edits_conflict_instead_of_overwriting(client, auth, bob, demo_board_id):
    await share(client, auth, demo_board_id, "bob")
    owner_copy = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()
    member_copy = (await client.get(f"/api/boards/{demo_board_id}", headers=bob)).json()

    owner_copy["data"]["columns"][0]["title"] = "Owner edit"
    member_copy["data"]["columns"][1]["title"] = "Member edit"
    assert (await save_board(client, auth, demo_board_id, owner_copy["data"], owner_copy["version"])).status_code == 200
    assert (await save_board(client, bob, demo_board_id, member_copy["data"], member_copy["version"])).status_code == 409

    data = await get_data(client, bob, demo_board_id)
    assert [c["title"] for c in data["columns"][:2]] == ["Owner edit", "Discovery"]
