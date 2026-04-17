"""Prepare migrated full-stack services, then start Agent-SaveMark on PostgreSQL."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import httpx
from sqlalchemy import create_engine, inspect, text
from sqlmodel import Session, select

from agentpocket.models.item import KnowledgeItem

ROOT = Path(__file__).resolve().parents[1]


def _storage_dir() -> Path:
    configured = os.environ.get("FDP_STORAGE__BASE_PATH")
    if configured:
        return Path(configured)
    return ROOT / "data"


def _sqlite_url() -> str:
    return f"sqlite:///{(_storage_dir() / 'Agent-SaveMark.db').as_posix()}"


def _postgres_url() -> str:
    return os.environ.get("FDP_DATABASE__URL", "postgresql://agent:agent@localhost:5432/Agent-SaveMark")


def _meili_url() -> str:
    return os.environ.get("FDP_SEARCH__MEILI_URL", "http://localhost:7700")


def _run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def _read_meili_key() -> str:
    env_key = os.environ.get("FDP_SEARCH__MEILI_MASTER_KEY")
    if env_key:
        return env_key

    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("FDP_SEARCH__MEILI_MASTER_KEY="):
                return line.partition("=")[2].strip()

    key_file = Path.home() / ".Agent-SaveMark" / "meili_master_key"
    if key_file.exists():
        return key_file.read_text(encoding="utf-8").strip()

    return ""


def _apply_runtime_env() -> None:
    os.environ.setdefault("FDP_STORAGE__BASE_PATH", str(_storage_dir()))
    os.environ.setdefault("FDP_DATABASE__URL", _postgres_url())
    os.environ.setdefault("FDP_SEARCH__BACKEND", "meilisearch")
    os.environ.setdefault("FDP_SEARCH__MEILI_URL", _meili_url())
    meili_key = _read_meili_key()
    if meili_key:
        os.environ.setdefault("FDP_SEARCH__MEILI_MASTER_KEY", meili_key)
    os.environ.setdefault("FDP_SEARCH__VECTOR_BACKEND", "chroma")


def _ensure_services() -> None:
    _run([sys.executable, "-m", "agentpocket.cli", "services", "up", "postgres", "meilisearch"])


def _postgres_item_count() -> int:
    engine = create_engine(_postgres_url())
    inspector = inspect(engine)
    if "knowledge_items" not in inspector.get_table_names():
        return 0
    with engine.connect() as connection:
        return int(connection.execute(text("SELECT COUNT(*) FROM knowledge_items")).scalar() or 0)


def _sqlite_item_count() -> int:
    sqlite_path = _storage_dir() / "Agent-SaveMark.db"
    if not sqlite_path.exists():
        return 0
    engine = create_engine(_sqlite_url())
    inspector = inspect(engine)
    if "knowledge_items" not in inspector.get_table_names():
        return 0
    with engine.connect() as connection:
        return int(connection.execute(text("SELECT COUNT(*) FROM knowledge_items")).scalar() or 0)


def _backfill_meilisearch() -> int:
    from agentpocket.db.session import get_engine, init_db
    from agentpocket.search.backends.meilisearch_backend import MeilisearchKeywordBackend

    init_db()
    backend = MeilisearchKeywordBackend()
    with Session(get_engine()) as db:
        backend.init(db)
        items = db.exec(select(KnowledgeItem)).all()
        for item in items:
            backend.index_item(db, item)
        return len(items)


def _prepare(
    force_migrate: bool,
    force_embeddings: bool,
    skip_service_up: bool,
    skip_embeddings: bool,
) -> None:
    if not skip_service_up:
        _ensure_services()
    _apply_runtime_env()

    postgres_count = _postgres_item_count()
    sqlite_count = _sqlite_item_count()

    if force_migrate or (postgres_count == 0 and sqlite_count > 0):
        print("migrating sqlite -> postgres")
        _run([
            sys.executable,
            str(ROOT / "scripts" / "migrate_sqlite_to_postgres.py"),
            "--sqlite-url",
            _sqlite_url(),
            "--postgres-url",
            _postgres_url(),
        ])
    else:
        print(f"skip migrate postgres_items={postgres_count} sqlite_items={sqlite_count}")

    indexed = _backfill_meilisearch()
    print(f"indexed meilisearch items={indexed}")

    if skip_embeddings:
        print("skip embedding backfill")
        return

    embedding_command = [sys.executable, str(ROOT / "scripts" / "backfill_chroma_embeddings.py")]
    if force_embeddings:
        embedding_command.append("--force")

    try:
        _run(embedding_command)
    except subprocess.CalledProcessError as error:
        print(f"embedding backfill skipped: exit={error.returncode}")


def _app_is_running(port: int = 4040) -> bool:
    try:
        response = httpx.get(f"http://localhost:{port}/api/v1/health", timeout=5.0)
        return response.status_code == 200
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force-migrate", action="store_true", help="Re-import SQLite into PostgreSQL even when PostgreSQL already has data.")
    parser.add_argument("--force-embeddings", action="store_true", help="Recompute all Chroma embeddings instead of only missing ones.")
    parser.add_argument("--prepare-only", action="store_true", help="Prepare services, migration, and indexes without starting the app.")
    parser.add_argument("--skip-service-up", action="store_true", help="Skip starting dependent services. Use this when services are already managed externally, such as by Docker Compose.")
    parser.add_argument("--skip-embeddings", action="store_true", help="Skip Chroma embedding backfill during prepare. Useful for lighter Docker images.")
    args = parser.parse_args()

    _prepare(
        force_migrate=args.force_migrate,
        force_embeddings=args.force_embeddings,
        skip_service_up=args.skip_service_up,
        skip_embeddings=args.skip_embeddings,
    )

    if args.prepare_only:
        print("prepare only complete")
        return

    if _app_is_running():
        print("app already running on http://localhost:4040")
        return

    os.execvpe(
        sys.executable,
        [sys.executable, "-m", "agentpocket.cli", "start", "--full"],
        os.environ,
    )


if __name__ == "__main__":
    main()