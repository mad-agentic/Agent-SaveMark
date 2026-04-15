---
description: "Use when editing FastAPI backend code, SQLModel models, MCP endpoints, workers, auth flows, AI integration, or Python tests under agentpocket. Covers sync handlers, SQLModel patterns, auth scoping, AI sanitization, and migration pitfalls."
name: "Backend Python Rules"
applyTo:
  - "src/agentpocket/**/*.py"
  - "tests/**/*.py"
---
# Backend Python Rules

- Keep backend imports and runtime entry points under `agentpocket`, not the old namespace.
- Prefer sync FastAPI route handlers (`def`) because the app is built around SQLModel sync access. Only use `async def` when the surrounding flow already requires it.
- Follow the existing API layering: routers in `src/agentpocket/api`, business logic in domain modules, persistence in models/session/search layers.
- Preserve explicit user scoping on database reads and writes. Queries that return user data should constrain by `user_id` unless the code path is intentionally global/admin-only.
- Use direct SQLModel patterns already present in the repo. Avoid adding a repository abstraction unless the change genuinely needs it.
- Changes touching auth, PATs, admin guards, sharing, or MCP must preserve current permission semantics across JWT and PAT flows.
- Sanitize user-provided content before sending it into LLM prompts. Reuse the existing sanitization path in `agentpocket.ai.sanitizer` instead of inventing a new one.
- Keep AI provider resolution centralized in `agentpocket.config` and `agentpocket.ai.factory`. Do not hardcode provider-specific settings deep in feature code.
- For schema evolution, follow the project convention described in `docs/plans/pat-mcp-synthesis.md`: `SQLModel.metadata.create_all()` plus `_ensure_columns()` style compatibility, not ad hoc destructive migration logic.
- Do not introduce `passlib`, `python-jose`, `axios`, `litellm`, or `langchain` as backend dependencies.
- When a backend change affects frontend contracts or MCP behavior, verify at least targeted backend tests and call out any remaining manual smoke test needs.

## Verification

- Preferred test run: `uv run pytest tests/ -x -q`
- Targeted validation is acceptable for focused changes, but auth, search, and MCP changes should include the most relevant tests.
- Run `make lint` when touching multiple backend files or shared backend infrastructure.

## Reference Docs

- `README.md` for install and product behavior
- `DEVELOPMENT.md` for local dev workflows
- `CLAUDE.md` for backend architecture and stack decisions
- `docs/plans/pat-mcp-synthesis.md` for PAT, MCP, and migration-specific backend patterns