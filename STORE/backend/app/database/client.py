from __future__ import annotations

from typing import AsyncIterator

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings


class MongoClientManager:
    def __init__(self) -> None:
        self._client: AsyncIOMotorClient | None = None

    def client(self) -> AsyncIOMotorClient:
        if self._client is None:
            settings = get_settings()
            self._client = AsyncIOMotorClient(settings.mongo_uri)
        return self._client

    def database(self) -> AsyncIOMotorDatabase:
        settings = get_settings()
        return self.client()[settings.mongo_db_name]

    async def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None


mongo_manager = MongoClientManager()


def get_database() -> AsyncIOMotorDatabase:
    return mongo_manager.database()


async def get_database_dependency() -> AsyncIterator[AsyncIOMotorDatabase]:
    yield get_database()
