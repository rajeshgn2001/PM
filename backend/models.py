from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

Priority = Literal["low", "medium", "high"]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]


class ChecklistItem(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=200)
    done: bool = False


class Card(BaseModel):
    id: str
    title: str
    details: str = ""
    priority: Priority | None = None
    dueDate: date | None = None
    assignee: str | None = None
    labels: list[Label] = Field(default=[], max_length=10)
    checklist: list[ChecklistItem] = Field(default=[], max_length=50)


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column] = Field(min_length=1)
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_integrity(self):
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("column ids must be unique")
        placed = [card_id for column in self.columns for card_id in column.cardIds]
        if len(placed) != len(set(placed)):
            raise ValueError("a card appears more than once in the columns")
        if set(placed) != set(self.cards):
            raise ValueError("every card must be in exactly one column")
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("card keys must match card ids")
        return self

    def assignees(self) -> set[str]:
        return {card.assignee for card in self.cards.values() if card.assignee}


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    username: str
    token: str


class UserProfile(BaseModel):
    username: str
    created_at: str
    board_count: int


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class AccountDeletion(BaseModel):
    password: str


class BoardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)


Role = Literal["owner", "member"]


class BoardSummary(BaseModel):
    id: int
    title: str
    role: Role
    owner: str
    created_at: str
    updated_at: str
    card_count: int


class Board(BaseModel):
    id: int
    title: str
    role: Role
    owner: str
    version: int
    data: BoardData


class BoardSave(BaseModel):
    version: int  # the version the client last loaded; a mismatch is a conflict
    data: BoardData


class SaveResult(BaseModel):
    version: int


class MemberAdd(BaseModel):
    username: str


class Member(BaseModel):
    username: str
    role: Role


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
    version: int
