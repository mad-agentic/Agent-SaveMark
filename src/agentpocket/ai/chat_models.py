"""Helpers for resolving and listing chat models for the active AI provider."""

from __future__ import annotations

import logging

import httpx

from agentpocket.ai.factory import get_resolved_ai_config
from agentpocket.ai.openai_compatible import PROVIDER_CONFIGS

logger = logging.getLogger(__name__)


def _merge_config(overrides: dict | None = None) -> dict:
    config = get_resolved_ai_config()
    if overrides:
        for key, value in overrides.items():
            if value not in (None, ""):
                config[key] = value
    return config


def get_active_chat_model(overrides: dict | None = None) -> str:
    """Return the effective chat model for the current provider."""
    config = _merge_config(overrides)
    provider = config.get("chat_provider") or "ollama"
    override_model = config.get("chat_model")

    if override_model:
        return override_model
    if provider == "ollama":
        return config.get("ollama_model") or PROVIDER_CONFIGS["ollama"]["default_model"]
    if provider == "custom":
        return config.get("custom_model") or ""
    return PROVIDER_CONFIGS.get(provider, {}).get("default_model", "")


def _dedupe_models(models: list[str], active_model: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    if active_model:
        ordered.append(active_model)
        seen.add(active_model)

    for model in models:
        cleaned = model.strip()
        if not cleaned or cleaned in seen:
            continue
        ordered.append(cleaned)
        seen.add(cleaned)

    return ordered


def _fetch_ollama_models(config: dict) -> list[str]:
    base_url = (config.get("ollama_url") or PROVIDER_CONFIGS["ollama"]["base_url"].removesuffix("/v1")).rstrip("/")
    response = httpx.get(f"{base_url}/api/tags", timeout=5)
    response.raise_for_status()
    data = response.json()
    models = data.get("models", [])
    return [model.get("name") or model.get("model") or "" for model in models if isinstance(model, dict)]


def _fetch_openai_compatible_models(base_url: str, api_key: str | None = None) -> list[str]:
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    response = httpx.get(f"{base_url.rstrip('/')}/models", headers=headers, timeout=8)
    response.raise_for_status()
    data = response.json()
    entries = data.get("data", [])
    return [entry.get("id") or "" for entry in entries if isinstance(entry, dict)]


def _resolve_available_chat_models(config: dict) -> tuple[list[str], str, str | None]:
    provider = config.get("chat_provider") or "ollama"
    active_model = get_active_chat_model(config)

    try:
        if provider == "ollama":
            return _dedupe_models(_fetch_ollama_models(config), active_model), "connected", None

        if provider == "groq":
            return (
                _dedupe_models(
                    _fetch_openai_compatible_models(
                        PROVIDER_CONFIGS["groq"]["base_url"],
                        config.get("groq_api_key"),
                    ),
                    active_model,
                ),
                "connected",
                None,
            )

        if provider == "nvidia":
            return (
                _dedupe_models(
                    _fetch_openai_compatible_models(
                        PROVIDER_CONFIGS["nvidia"]["base_url"],
                        config.get("nvidia_api_key"),
                    ),
                    active_model,
                ),
                "connected",
                None,
            )

        if provider == "custom":
            if config.get("custom_api_type") == "anthropic":
                return _dedupe_models([], active_model), "connected", None

            base_url = config.get("custom_base_url") or ""
            api_key = config.get("custom_api_key") or ""
            if base_url:
                return _dedupe_models(_fetch_openai_compatible_models(base_url, api_key), active_model), "connected", None
    except Exception as exc:
        logger.info("Could not fetch model list for provider %s: %s", provider, exc)
        return _dedupe_models([], active_model), "failed", "Failed to fetch models from provider"

    return _dedupe_models([], active_model), "connected", None


def list_available_chat_models(overrides: dict | None = None) -> list[str]:
    """List selectable models for the current chat provider."""
    config = _merge_config(overrides)
    models, _, _ = _resolve_available_chat_models(config)
    return models


def get_chat_model_metadata(overrides: dict | None = None) -> dict:
    """Return provider metadata used by the chatbox model selector."""
    config = _merge_config(overrides)
    available_models, model_fetch_status, model_fetch_message = _resolve_available_chat_models(config)
    return {
        "provider": config.get("chat_provider") or "ollama",
        "active_model": get_active_chat_model(config),
        "available_models": available_models,
        "model_fetch_status": model_fetch_status,
        "model_fetch_message": model_fetch_message,
    }
