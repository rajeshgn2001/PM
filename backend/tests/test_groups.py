import sqlite3

from conftest import register
from database import DEFAULT_BOARD_TITLE, get_db_path, init_db


async def groups_of(client, headers) -> list[dict]:
    return (await client.get("/api/groups", headers=headers)).json()


async def board_groups(client, headers) -> dict[str, int]:
    boards = (await client.get("/api/boards", headers=headers)).json()
    return {board["title"]: board["group_id"] for board in boards}


async def test_every_user_starts_with_a_default_group_holding_their_boards(client, auth):
    alice = await register(client, "alice")
    for headers, title in [(auth, DEFAULT_BOARD_TITLE), (alice, "My First Board")]:
        groups = await groups_of(client, headers)
        assert [group["name"] for group in groups] == ["DEFAULT"]
        assert await board_groups(client, headers) == {title: groups[0]["id"]}


async def test_new_boards_go_to_the_default_group(client, auth):
    default = (await groups_of(client, auth))[0]["id"]
    await client.post("/api/groups", json={"name": "Work"}, headers=auth)
    await client.post("/api/boards", json={"title": "Launch"}, headers=auth)
    assert (await board_groups(client, auth))["Launch"] == default


async def test_create_group_validates_name(client, auth):
    created = await client.post("/api/groups", json={"name": "  Work  "}, headers=auth)
    assert created.status_code == 201
    assert created.json()["name"] == "Work"
    assert (await client.post("/api/groups", json={"name": "Work"}, headers=auth)).status_code == 409
    assert (await client.post("/api/groups", json={"name": "   "}, headers=auth)).status_code == 422
    assert (await client.post("/api/groups", json={"name": "x" * 101}, headers=auth)).status_code == 422


async def test_rename_group_including_default(client, auth, demo_board_id):
    default = (await groups_of(client, auth))[0]["id"]
    renamed = await client.patch(f"/api/groups/{default}", json={"name": " Personal "}, headers=auth)
    assert renamed.status_code == 200
    assert renamed.json() == {"id": default, "name": "Personal"}
    assert await groups_of(client, auth) == [{"id": default, "name": "Personal"}]
    # Still the default group: unplaced boards stay in it and new ones go to it.
    assert (await board_groups(client, auth))[DEFAULT_BOARD_TITLE] == default
    await client.post("/api/boards", json={"title": "Launch"}, headers=auth)
    assert (await board_groups(client, auth))["Launch"] == default


async def test_rename_group_rejects_a_taken_name(client, auth):
    default = (await groups_of(client, auth))[0]["id"]
    await client.post("/api/groups", json={"name": "Work"}, headers=auth)
    assert (await client.patch(f"/api/groups/{default}", json={"name": "Work"}, headers=auth)).status_code == 409
    assert (await groups_of(client, auth))[0]["name"] == "DEFAULT"


async def test_move_board_between_groups_keeps_its_data(client, auth, demo_board_id):
    before = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()
    default = (await groups_of(client, auth))[0]["id"]
    work = (await client.post("/api/groups", json={"name": "Work"}, headers=auth)).json()["id"]

    move = {"group_id": work}
    assert (await client.put(f"/api/boards/{demo_board_id}/group", json=move, headers=auth)).status_code == 204
    assert (await board_groups(client, auth))[DEFAULT_BOARD_TITLE] == work

    move = {"group_id": default}
    assert (await client.put(f"/api/boards/{demo_board_id}/group", json=move, headers=auth)).status_code == 204
    assert (await board_groups(client, auth))[DEFAULT_BOARD_TITLE] == default
    # Moving is not an edit, so concurrent savers are not disturbed.
    assert (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json() == before


async def test_groups_are_private_to_each_user(client, auth, demo_board_id):
    alice = await register(client, "alice")
    alice_default = (await groups_of(client, alice))[0]["id"]
    demo_default = (await groups_of(client, auth))[0]["id"]

    rename = await client.patch(f"/api/groups/{alice_default}", json={"name": "Hacked"}, headers=auth)
    assert rename.status_code == 404
    # A group of someone else, and a board of someone else, look like they do not exist.
    move = {"group_id": alice_default}
    assert (await client.put(f"/api/boards/{demo_board_id}/group", json=move, headers=auth)).status_code == 404
    move = {"group_id": demo_default}
    assert (await client.put(f"/api/boards/{demo_board_id}/group", json=move, headers=alice)).status_code == 404
    assert (await client.get("/api/groups")).status_code == 401


async def test_shared_board_has_an_independent_group_for_each_user(client, auth, demo_board_id):
    alice = await register(client, "alice")
    await client.post(f"/api/boards/{demo_board_id}/members", json={"username": "alice"}, headers=auth)
    alice_default = (await groups_of(client, alice))[0]["id"]
    demo_default = (await groups_of(client, auth))[0]["id"]
    assert (await board_groups(client, alice))[DEFAULT_BOARD_TITLE] == alice_default

    alice_work = (await client.post("/api/groups", json={"name": "Work"}, headers=alice)).json()["id"]
    move = {"group_id": alice_work}
    assert (await client.put(f"/api/boards/{demo_board_id}/group", json=move, headers=alice)).status_code == 204
    assert (await board_groups(client, alice))[DEFAULT_BOARD_TITLE] == alice_work
    assert (await board_groups(client, auth))[DEFAULT_BOARD_TITLE] == demo_default


async def test_leaving_a_shared_board_forgets_its_placement(client, auth, demo_board_id):
    alice = await register(client, "alice")
    await client.post(f"/api/boards/{demo_board_id}/members", json={"username": "alice"}, headers=auth)
    work = (await client.post("/api/groups", json={"name": "Work"}, headers=alice)).json()["id"]
    await client.put(f"/api/boards/{demo_board_id}/group", json={"group_id": work}, headers=alice)

    await client.delete(f"/api/boards/{demo_board_id}/members/alice", headers=alice)
    await client.post(f"/api/boards/{demo_board_id}/members", json={"username": "alice"}, headers=auth)
    default = (await groups_of(client, alice))[0]["id"]
    assert (await board_groups(client, alice))[DEFAULT_BOARD_TITLE] == default


async def test_deleting_a_placed_board_or_account_cleans_up(client, auth, demo_board_id):
    alice = await register(client, "alice", "secret123")
    work = (await client.post("/api/groups", json={"name": "Work"}, headers=alice)).json()["id"]
    board = (await client.post("/api/boards", json={"title": "Temp"}, headers=alice)).json()["id"]
    await client.put(f"/api/boards/{board}/group", json={"group_id": work}, headers=alice)
    assert (await client.delete(f"/api/boards/{board}", headers=alice)).status_code == 204

    assert (
        await client.request("DELETE", "/api/auth/me", json={"password": "secret123"}, headers=alice)
    ).status_code == 204
    conn = sqlite3.connect(get_db_path())
    assert conn.execute("SELECT COUNT(*) FROM board_placements").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM board_groups").fetchone()[0] == 1  # the demo user's default
    conn.close()


async def test_migration_keeps_existing_data_and_is_repeatable(client, auth, demo_board_id):
    """A database from before groups: every board lands in a new DEFAULT group, unchanged."""
    before = (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json()
    conn = sqlite3.connect(get_db_path())
    conn.executescript("DROP TABLE board_placements; DROP TABLE board_groups;")
    conn.close()

    init_db()
    groups = await groups_of(client, auth)
    assert [group["name"] for group in groups] == ["DEFAULT"]
    assert (await board_groups(client, auth))[DEFAULT_BOARD_TITLE] == groups[0]["id"]
    assert (await client.get(f"/api/boards/{demo_board_id}", headers=auth)).json() == before

    # Later restarts leave renamed groups and placements alone.
    await client.patch(f"/api/groups/{groups[0]['id']}", json={"name": "Personal"}, headers=auth)
    work = (await client.post("/api/groups", json={"name": "Work"}, headers=auth)).json()["id"]
    await client.put(f"/api/boards/{demo_board_id}/group", json={"group_id": work}, headers=auth)
    init_db()
    assert [group["name"] for group in await groups_of(client, auth)] == ["Personal", "Work"]
    assert (await board_groups(client, auth))[DEFAULT_BOARD_TITLE] == work
