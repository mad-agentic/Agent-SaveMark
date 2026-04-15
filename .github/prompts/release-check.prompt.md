---
description: "Use when preparing a release, release candidate, or a large PR that needs build, version, docs, and smoke-test verification across backend, frontend, and MCP surfaces."
name: "Release Check"
argument-hint: "Version, PR scope, or release context"
agent: "agent"
---
Prepare a release-readiness check for this workspace using the provided context: ${input:Version, PR scope, or release context}

Work through this checklist and adapt it to the actual changes in the branch:

1. Identify the scope of the change from the diff and relevant docs.
2. Verify version sync where relevant:
   - `pyproject.toml`
   - `frontend/package.json`
   - `extension/package.json`
3. Run or recommend the right validation set:
   - backend tests
   - frontend build
   - lint if the scope is broad
4. Check startup and runtime entry points still match the current namespace and scripts.
5. Review MCP- and auth-related surfaces when touched:
   - PAT behavior
   - `/mcp` integration
   - any required manual smoke tests
6. Check docs that should be updated instead of duplicating release notes:
   - `README.md`
   - `DEVELOPMENT.md`
   - `CLAUDE.md`
   - `docs/plans/*.md` when implementation notes changed
7. Summarize risks, missing verification, and merge blockers.

Output format:

- `Release scope:` short summary
- `Checks passed:` completed verification
- `Checks pending:` anything not run or requiring manual validation
- `Docs to update:` exact files if needed
- `Risks:` regressions, API contract changes, auth/data-scope risks
- `Recommended ship decision:` ready / needs follow-up