from __future__ import annotations

from pathlib import Path


class FileStorage:
    def __init__(self, root: str = "uploads") -> None:
        self.root = Path(root)

    async def save(self, filename: str, content: bytes) -> str:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / filename
        path.write_bytes(content)
        return str(path)


file_storage = FileStorage()
