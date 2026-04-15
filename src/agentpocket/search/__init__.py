"""Search package — provides get_search_service() for unified search access."""

import logging

logger = logging.getLogger(__name__)

_search_service = None


def get_search_service():
    """Lazy-build and return the SearchService singleton."""
    global _search_service
    if _search_service is not None:
        return _search_service

    from agentpocket.config import get_settings
    from agentpocket.search.reranker import build_reranker
    from agentpocket.search.service import SearchService

    settings = get_settings()

    # Build keyword backend
    if settings.search.backend == "meilisearch":
        from agentpocket.search.backends.meilisearch_backend import MeilisearchKeywordBackend

        keyword = MeilisearchKeywordBackend()
    else:
        from agentpocket.search.backends.sqlite_fts_backend import SqliteFtsBackend

        keyword = SqliteFtsBackend()

    # Build vector backend
    vector_choice = settings.search.vector_backend
    if vector_choice == "auto":
        vector_choice = (
            "pgvector" if settings.database.url.startswith("postgresql") else "chroma"
        )

    if vector_choice == "pgvector":
        from agentpocket.search.backends.pgvector_backend import PgVectorBackend

        vector = PgVectorBackend()
    else:
        from agentpocket.search.backends.chroma_backend import ChromaBackend

        vector = ChromaBackend()

    reranker = build_reranker(settings)

    _search_service = SearchService(keyword=keyword, vector=vector, reranker=reranker)
    return _search_service


def reset_search_service():
    """Reset the singleton (useful for tests)."""
    global _search_service
    _search_service = None
