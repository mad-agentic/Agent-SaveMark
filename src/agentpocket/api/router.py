"""Root API router - includes all sub-routers."""

from fastapi import APIRouter

from agentpocket.api.admin import router as admin_router
from agentpocket.api.ai import router as ai_router
from agentpocket.api.api_tokens import router as api_tokens_router
from agentpocket.api.auth import router as auth_router
from agentpocket.api.collections import item_collections_router
from agentpocket.api.collections import router as collections_router
from agentpocket.api.comments import router as comments_router
from agentpocket.api.entities import router as entities_router
from agentpocket.api.feeds import router as feeds_router
from agentpocket.api.highlights import router as highlights_router
from agentpocket.api.import_export import router as import_export_router
from agentpocket.api.item_links import router as item_links_router
from agentpocket.api.items import router as items_router
from agentpocket.api.notes import item_notes_router
from agentpocket.api.notes import router as notes_router
from agentpocket.api.rss import router as rss_router
from agentpocket.api.rules import router as rules_router
from agentpocket.api.saved_filters import router as saved_filters_router
from agentpocket.api.search import router as search_router
from agentpocket.api.settings import router as settings_router
from agentpocket.api.sharing import public_router
from agentpocket.api.sharing import router as sharing_router
from agentpocket.api.stats import router as stats_router
from agentpocket.api.tags import router as tags_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(api_tokens_router)
api_router.include_router(items_router)
api_router.include_router(notes_router)
api_router.include_router(item_notes_router)
api_router.include_router(tags_router)
api_router.include_router(collections_router)
api_router.include_router(search_router)
api_router.include_router(ai_router)
api_router.include_router(import_export_router)
api_router.include_router(sharing_router)
api_router.include_router(comments_router)
api_router.include_router(feeds_router)
api_router.include_router(public_router)
api_router.include_router(admin_router)
api_router.include_router(settings_router)
api_router.include_router(stats_router)
api_router.include_router(rules_router)
api_router.include_router(highlights_router)
api_router.include_router(rss_router)
api_router.include_router(item_links_router)
api_router.include_router(item_collections_router)
api_router.include_router(saved_filters_router)
api_router.include_router(entities_router)
