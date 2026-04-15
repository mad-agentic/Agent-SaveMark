---
description: "Use when editing React, TypeScript, Vite, Zustand, or TanStack Query code under frontend/src. Covers fetch client usage, query patterns, Zustand boundaries, UI contract safety, and frontend verification."
name: "Frontend React Rules"
applyTo:
  - "frontend/src/**/*.ts"
  - "frontend/src/**/*.tsx"
---
# Frontend React Rules

- Keep frontend code on the current stack: React 19, TypeScript, Vite, Tailwind v4, TanStack Query, and Zustand.
- Use the existing API client and native `fetch` flow from `frontend/src/api/client.ts`. Do not introduce `axios` or parallel API wrappers.
- Keep server state in TanStack Query hooks and lightweight client UI state in Zustand. Do not move fetched server data into Zustand unless there is an explicit reason.
- Preserve the current pattern of feature hooks in `frontend/src/hooks` and page/component separation in `frontend/src/pages` and `frontend/src/components`.
- Follow existing API contract shapes carefully. If a backend response changes, update the frontend types and the backend together.
- Prefer targeted UI edits over broad component rewrites. Reuse established styling tokens and patterns already present in the app.
- When rendering user-provided HTML or markdown, keep sanitization in place and reuse existing `DOMPurify`-based paths.
- Keep chat, search, settings, and entity flows consistent with the current data flow and lazy-loading patterns.
- Avoid unnecessary memoization or abstraction. Match the repo's current React style instead of introducing a different architectural pattern.

## Verification

- Required build verification after meaningful frontend changes: `cd frontend && pnpm build`
- If the change spans frontend and backend contracts, verify both frontend build and targeted backend tests.

## Reference Docs

- `README.md` for product behavior and user-facing flows
- `DEVELOPMENT.md` for local frontend/backend startup combinations
- `CLAUDE.md` for frontend stack and architectural conventions
- `docs/plans/search-architecture-enhancements.md` for search-related UI and retrieval context