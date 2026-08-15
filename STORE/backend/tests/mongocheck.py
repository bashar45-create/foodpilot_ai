from __future__ import annotations

import asyncio
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.database.client import mongo_manager


async def main() -> int:
    settings = get_settings()
    client = mongo_manager.client()

    try:
        ping_result = await client.admin.command("ping")
        database = mongo_manager.database()
        collections = await database.list_collection_names()

        print("Mongo connection: OK")
        print(f"Database: {database.name}")
        print(f"Ping: {ping_result.get('ok')}")
        print(f"Collections: {', '.join(collections) if collections else '(none)'}")
        print(f"URI configured: {bool(settings.mongo_uri)}")
        return 0
    except Exception as exc:  # pragma: no cover - smoke script
        print(f"Mongo connection: FAILED -> {exc}")
        return 1
    finally:
        await mongo_manager.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
