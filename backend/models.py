from pydantic import BaseModel, model_validator

COLUMN_IDS = ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]


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

    @model_validator(mode="after")
    def check_integrity(self):
        if [column.id for column in self.columns] != COLUMN_IDS:
            raise ValueError(f"columns must be exactly {COLUMN_IDS} in order")
        placed = [card_id for column in self.columns for card_id in column.cardIds]
        if len(placed) != len(set(placed)):
            raise ValueError("a card appears more than once in the columns")
        if set(placed) != set(self.cards):
            raise ValueError("every card must be in exactly one column")
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("card keys must match card ids")
        return self


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
