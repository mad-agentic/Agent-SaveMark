# Project Guidelines

## Build and Test

- Backend env: Python 3.12+ with `uv`.
- Frontend env: Node.js 18+ with `pnpm`.
- Install backend deps: `uv sync --all-extras`.
- Run backend locally: `uv run uvicorn agentpocket.main:app --port 4040`.
- Run frontend locally: `cd frontend && pnpm install && pnpm dev`.
- Preferred backend test run: `uv run pytest tests/ -x -q`.
- Frontend verification: `cd frontend && pnpm build`.
- Lint: `make lint`.

## Architecture

- Backend package namespace is `agentpocket` under `src/agentpocket`.
- Backend stack: FastAPI + SQLModel + sync route handlers. Prefer `def` handlers over `async def` unless the surrounding code already requires async behavior.
- Frontend stack: React 19 + TypeScript + Vite + Tailwind v4.
- Search is chunk-based hybrid retrieval. Preserve the separation between API, AI, search backends, workers, and models.
- AI provider configuration is centralized through `agentpocket.config` and `agentpocket.ai.factory`.
- MCP support is a first-class feature. Changes touching auth, tokens, or tool exposure should consider `/mcp` behavior.

## Conventions

- Keep branding as `Agent-SaveMark`; only use `agentpocket` for Python module imports and runtime entry points.
- Follow existing backend patterns: direct SQLModel usage, explicit user scoping, and env-driven config with `FDP_` prefixes.
- Do not introduce `axios`, `litellm`, `langchain`, `passlib`, or `python-jose`.
- Sanitize user-provided content before sending it to LLM prompts.
- Preserve the current frontend data flow: native `fetch`, TanStack Query for server state, Zustand for lightweight client state.
- Prefer small, targeted edits. Do not refactor adjacent code unless the change requires it.

## Docs

- Start with `README.md` for product overview, install modes, CLI usage, and MCP setup.
- Use `DEVELOPMENT.md` for local development workflows and environment combinations.
- Use `CLAUDE.md` for codebase structure, stack decisions, and project-specific do/don't rules.
- For deeper implementation notes, see `docs/plans/pat-mcp-synthesis.md` and `docs/plans/search-architecture-enhancements.md`.

## Pitfalls

- Generated directories such as `.venv`, `.runtime`, `frontend/dist`, `frontend/node_modules`, and extension build output can contain stale references; do not treat them as source of truth.
- Database-backed artifacts may preserve historical content. Verify whether a string match is in code, generated cache, or persisted user data before editing it.
- If a change touches both frontend and backend contracts, verify both `pnpm build` and at least targeted backend tests before concluding.
