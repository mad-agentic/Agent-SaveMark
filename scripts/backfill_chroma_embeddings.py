"""Backfill missing Chroma embeddings from the current database."""

from __future__ import annotations

import argparse
import uuid

from sqlmodel import Session, select

from agentpocket.ai.factory import get_embedding_provider
from agentpocket.db.session import get_engine, init_db
from agentpocket.models.item import KnowledgeItem
from agentpocket.models.item_chunk import ItemChunk
from agentpocket.search.semantic import _get_collection
from agentpocket.workers.enrichment_pipeline import handle_chunking, handle_embedding


def _chunk_ids_for_item(db: Session, item_id: uuid.UUID) -> list[str]:
    chunks = db.exec(
        select(ItemChunk).where(ItemChunk.item_id == item_id).order_by(ItemChunk.chunk_order)
    ).all()
    return [str(chunk.id) for chunk in chunks]


def _item_needs_backfill(db: Session, item: KnowledgeItem, force: bool) -> bool:
    if force:
        return True

    collection = _get_collection(item.user_id)
    item_result = collection.get(ids=[str(item.id)], include=[])
    if not item_result.get("ids"):
        return True

    chunk_ids = _chunk_ids_for_item(db, item.id)
    if not chunk_ids:
        return True

    chunk_result = collection.get(ids=chunk_ids, include=[])
    existing_ids = set(chunk_result.get("ids") or [])
    return len(existing_ids) != len(chunk_ids)


def backfill_embeddings(force: bool = False, limit: int | None = None) -> tuple[int, int]:
    init_db()
    get_embedding_provider()

    embedded = 0
    skipped = 0

    with Session(get_engine()) as db:
        items = db.exec(select(KnowledgeItem).order_by(KnowledgeItem.created_at)).all()
        if limit is not None:
            items = items[:limit]

        for item in items:
            content = item.content or item.description or item.title or ""
            if not content.strip():
                skipped += 1
                continue

            if not _chunk_ids_for_item(db, item.id):
                handle_chunking(db, item.id, item.user_id)

            if not _item_needs_backfill(db, item, force):
                skipped += 1
                continue

            handle_embedding(db, item.id, item.user_id)
            embedded += 1
            print(f"embedded {item.id} {item.title or item.url or ''}".strip())

    return embedded, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recompute embeddings even when item and chunk vectors already exist in Chroma.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit for the number of items to process.",
    )
    args = parser.parse_args()

    embedded, skipped = backfill_embeddings(force=args.force, limit=args.limit)
    print(f"done embedded={embedded} skipped={skipped}")


if __name__ == "__main__":
    main()