"""Background workers using Huey with SQLite backend."""

import os
from pathlib import Path

from huey import SqliteHuey

from agentpocket.config import get_settings

settings = get_settings()
# Resolve to absolute path so Huey can open the DB regardless of CWD
base = os.environ.get("FDP_HUEY__BASE_PATH") or settings.storage.base_path
base_path = Path(base).expanduser().resolve()
base_path.mkdir(parents=True, exist_ok=True)

huey = SqliteHuey(
    name="Agent-SaveMark",
    filename=str(base_path / "huey_tasks.db"),
    immediate=False,
    journal_mode=os.environ.get("FDP_HUEY__JOURNAL_MODE", "wal"),
)
