from __future__ import annotations

from typing import Any


class BaseRepository:
    def __init__(self, db: Any | None, collection_name: str) -> None:
        self.db = db
        self.collection_name = collection_name
