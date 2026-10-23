import json
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from sqlite3 import Row
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

import database as db
from ai import generate_simple_completion, generate_structured_chat
from models import (
    AccountDeletion,
    AuthResponse,
    Board,
    BoardCreate,
    BoardData,
    BoardSave,
    BoardSummary,
    ChatRequest,
    ChatResponse,
    Credentials,
    LoginRequest,
    Member,
    MemberAdd,
    PasswordChange,
    SaveResult,
    UserProfile,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="Kanban Studio API", lifespan=lifespan)

STATIC_DIR = Path(__file__).resolve().parent / "static"

bearer = HTTPBearer(auto_error=False)


def session_token(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> str:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not signed in")
    return credentials.credentials


def current_user(token: Annotated[str, Depends(session_token)]) -> Row:
    user = db.get_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    return user


CurrentUser = Annotated[Row, Depends(current_user)]
Token = Annotated[str, Depends(session_token)]


def accessible_board(board_id: int, user: CurrentUser) -> dict:
    """A board the user owns or is a member of; anything else looks like it does not exist."""
    board = db.get_board(user["id"], board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


def owned_board(board: Annotated[dict, Depends(accessible_board)]) -> dict:
    if board["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the board owner can do this")
    return board


AccessibleBoard = Annotated[dict, Depends(accessible_board)]
OwnedBoard = Annotated[dict, Depends(owned_board)]


def check_assignees(board_id: int, data: BoardData):
    members = {member["username"] for member in db.list_members(board_id)}
    outsiders = sorted(data.assignees() - members)
    if outsiders:
        raise HTTPException(status_code=422, detail=f"{outsiders[0]} is not a member of this board")


def save_or_conflict(board_id: int, data: BoardData, version: int) -> int:
    new_version = db.save_board_data(board_id, data.model_dump(mode="json"), version)
    if new_version is None:
        raise HTTPException(status_code=409, detail="The board was changed by someone else. Reload to see the latest version.")
    return new_version


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Backend healthy"}


# Auth and account management


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
async def register(credentials: Credentials):
    user_id = db.create_user(credentials.username, credentials.password)
    if user_id is None:
        raise HTTPException(status_code=409, detail="Username is already taken")
    return AuthResponse(username=credentials.username, token=db.create_session(user_id))


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(credentials: LoginRequest):
    user = db.authenticate(credentials.username, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return AuthResponse(username=user["username"], token=db.create_session(user["id"]))


@app.post("/api/auth/logout", status_code=204)
async def logout(token: Token):
    db.delete_session(token)


@app.get("/api/auth/me", response_model=UserProfile)
async def me(user: CurrentUser):
    return UserProfile(
        username=user["username"],
        created_at=user["created_at"],
        board_count=len(db.list_boards(user["id"])),
    )


@app.put("/api/auth/password", status_code=204)
async def change_password(change: PasswordChange, user: CurrentUser, token: Token):
    if not db.verify_password(change.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    db.update_password(user["id"], change.new_password, keep_token=token)


@app.delete("/api/auth/me", status_code=204)
async def delete_account(deletion: AccountDeletion, user: CurrentUser):
    if not db.verify_password(deletion.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    db.delete_user(user["id"])


# Boards


@app.get("/api/boards", response_model=list[BoardSummary])
async def list_boards(user: CurrentUser):
    return db.list_boards(user["id"])


@app.post("/api/boards", response_model=Board, status_code=201)
async def create_board(board: BoardCreate, user: CurrentUser):
    return db.create_board(user["id"], board.title.strip())


@app.get("/api/boards/{board_id}", response_model=Board)
async def get_board(board: AccessibleBoard):
    return board


@app.put("/api/boards/{board_id}", response_model=SaveResult)
async def save_board(save: BoardSave, board: AccessibleBoard):
    check_assignees(board["id"], save.data)
    return SaveResult(version=save_or_conflict(board["id"], save.data, save.version))


@app.patch("/api/boards/{board_id}", response_model=Board)
async def rename_board(update: BoardCreate, board: OwnedBoard, user: CurrentUser):
    db.rename_board(board["id"], update.title.strip())
    return db.get_board(user["id"], board["id"])


@app.delete("/api/boards/{board_id}", status_code=204)
async def delete_board(board: OwnedBoard):
    db.delete_board(board["id"])


# Sharing


@app.get("/api/boards/{board_id}/members", response_model=list[Member])
async def list_members(board: AccessibleBoard):
    return db.list_members(board["id"])


@app.post("/api/boards/{board_id}/members", response_model=list[Member], status_code=201)
async def add_member(member: MemberAdd, board: OwnedBoard):
    result = db.add_member(board["id"], member.username.strip())
    if result == "unknown":
        raise HTTPException(status_code=404, detail=f"No user named {member.username.strip()}")
    if result == "exists":
        raise HTTPException(status_code=409, detail=f"{member.username.strip()} already has access")
    return db.list_members(board["id"])


@app.delete("/api/boards/{board_id}/members/{username}", status_code=204)
async def remove_member(username: str, board: AccessibleBoard, user: CurrentUser):
    """The owner can remove anyone; a member can only remove themselves (leave)."""
    if board["role"] != "owner" and username != user["username"]:
        raise HTTPException(status_code=403, detail="Only the board owner can remove other members")
    if not db.remove_member(board["id"], username):
        raise HTTPException(status_code=404, detail=f"{username} is not a member of this board")


# AI


@app.post("/api/ai/test")
async def test_ai_connectivity(user: CurrentUser):
    try:
        result = await generate_simple_completion("What is 2+2? Return only the number.")
        return {"prompt": "What is 2+2?", "response": result, "status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def build_system_prompt(board: dict, members: list[str], username: str) -> str:
    return f"""
You are an intelligent project management assistant integrated into Kanban Studio.
Today's date is {date.today().isoformat()}.
The user's current board is titled "{board["title"]}". Its state is provided below in JSON format:
{json.dumps(board["data"], indent=2)}

You can help the user understand, manage, and update this board.
The board has columns (each with id, title, and ordered list of cardIds) and cards
(dictionary of id -> {{id, title, details, priority, dueDate, assignee, labels, checklist}}).
priority is "low", "medium", "high" or null. dueDate is an ISO date (YYYY-MM-DD) or null.
assignee is a username or null; it must be one of the board members: {", ".join(members)}.
labels is a list of short tags. checklist is a list of {{id, text, done}} subtasks; new items get ids like "item-" + random alphanumeric.
You are talking to {username} ("me" means {username}). The last column counts as done.

RULES FOR RESPONSES:
1. If the user asks a question without asking to change the board, set "board_update" to null.
2. If the user asks to add, move, edit, or delete cards or columns:
   - Return the COMPLETE modified board in "board_update".
   - Every card must appear in exactly one column's cardIds, and every id in cardIds must exist in cards.
   - For new cards, generate a unique id like "card-" + random alphanumeric; for new columns use "col-" + random alphanumeric.
   - Column ids must be unique and there must be at least one column. Keep existing ids unchanged.
   - Preserve all existing cards and fields unless explicitly asked to modify them.
   - Explain what change you made in "message".
"""


@app.post("/api/boards/{board_id}/ai/chat", response_model=ChatResponse)
async def ai_chat(request: ChatRequest, board: AccessibleBoard, user: CurrentUser):
    members = [member["username"] for member in db.list_members(board["id"])]
    try:
        output = await generate_structured_chat(
            user_prompt=request.message,
            system_instruction=build_system_prompt(board, members, user["username"]),
            history=[{"role": msg.role, "content": msg.content} for msg in request.history],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    version = board["version"]
    if output.board_update:
        check_assignees(board["id"], output.board_update)
        # Saved against the version the AI saw, so edits made meanwhile by others are not lost.
        version = save_or_conflict(board["id"], output.board_update, version)
    return ChatResponse(
        message=output.message,
        board_update=output.board_update,
        board_changed=output.board_update is not None,
        version=version,
    )


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
