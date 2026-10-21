import json
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ai import generate_simple_completion, generate_structured_chat
from database import get_board, init_db, save_board
from models import BoardData, ChatRequest, ChatResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Kanban MVP API", lifespan=lifespan)

STATIC_DIR = Path(__file__).resolve().parent / "static"


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    authenticated: bool
    username: str
    token: str


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Backend healthy"}


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    if credentials.username == "user" and credentials.password == "password":
        return LoginResponse(
            authenticated=True,
            username="user",
            token="kanban-session-user",
        )
    raise HTTPException(status_code=401, detail="Invalid username or password")


@app.post("/api/auth/logout")
async def logout():
    return {"authenticated": False, "message": "Logged out successfully"}


@app.get("/api/board", response_model=BoardData)
async def fetch_board():
    board = get_board("user")
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@app.put("/api/board", response_model=BoardData)
async def persist_board(board: BoardData):
    saved = save_board(board.model_dump(), username="user")
    return saved


@app.post("/api/ai/test")
async def test_ai_connectivity():
    try:
        result = await generate_simple_completion("What is 2+2? Return only the number.")
        return {"prompt": "What is 2+2?", "response": result, "status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/chat", response_model=ChatResponse)
async def ai_chat(request: ChatRequest):
    current_board = get_board("user")
    if not current_board:
        raise HTTPException(status_code=404, detail="Board not found")

    system_instruction = f"""
You are an intelligent project management assistant integrated into Kanban Studio.
The current Kanban board state is provided below in JSON format:
{json.dumps(current_board, indent=2)}

You can help the user understand, manage, and update their Kanban board.
The board has columns (each with id, title, and ordered list of cardIds) and cards (dictionary of id -> {{id, title, details}}).

RULES FOR RESPONSES:
1. You MUST respond with valid JSON matching this schema:
{{
  "message": "<Conversational explanation to the user>",
  "board_update": <null OR the complete modified BoardData object if you created, moved, edited, or removed cards>
}}
2. If the user asks a question without asking to change the board (e.g. "What cards are in Backlog?"), set "board_update": null.
3. If the user asks to add, move, edit, or delete a card:
   - Return the COMPLETE modified BoardData object in "board_update".
   - Ensure every card referenced in column.cardIds exists in the cards dictionary.
   - For new cards, generate a unique id like "card-" + random alphanumeric.
   - Preserve all existing cards unless explicitly asked to modify them.
   - The five columns are fixed: never add, remove, reorder, or change column ids. Columns may only be renamed.
   - Every card must appear in exactly one column's cardIds.
   - Explain what change you made in "message".
4. Do not include markdown formatting or backticks around the JSON; return raw JSON only.
"""

    history_payload = [
        {"role": msg.role, "content": msg.content} for msg in request.history
    ]

    try:
        output = await generate_structured_chat(
            user_prompt=request.message,
            system_instruction=system_instruction,
            history=history_payload,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if output.board_update:
        save_board(output.board_update.model_dump(), username="user")
    return ChatResponse(
        message=output.message,
        board_update=output.board_update,
        board_changed=output.board_update is not None,
    )


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
