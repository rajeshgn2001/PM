from pydantic import BaseModel


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatOutput(BaseModel):
    message: str
    board_update: BoardData | None = None


class ChatResponse(BaseModel):
    message: str
    board_update: BoardData | None = None
    board_changed: bool = False
