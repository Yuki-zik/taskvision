# TaskVision Project Overview

## Product contract

TaskVision is a source-linked knowledge and collaboration workspace for humans and coding agents. Its core flows are human intent → Agent, reusable history → future developers, review hotspots → humans, tagged source → Agent, and explicit scoped coordination between Agents. VS Code, Web, MCP and CLI share one domain contract. Local-first; no automatic cloud synchronization, agent scheduler, merge or remote publication.

## Source boundaries

| Path | Responsibility |
|---|---|
| `src/*.ts`, `src/commands/` | VS Code integration, existing task/highlight/export behavior, opt-in service bridge |
| `packages/shared/src/` | Domain types and Zod operation contracts |
| `packages/core/src/` | Source/index cache, syntax, filesystem boundary, knowledge, repository coordinates, SQLite, task leases and review baselines |
| `apps/web/src/` | React/React Flow/ELK workbench, drafts, knowledge, task and review interfaces |
| `apps/server/src/` | Loopback HTTP and same-origin human writes |
| `apps/mcp/src/` | 11 Agent tools, source resource and onboarding prompt |
| `apps/cli/src/` | Validated command-line Agent interface |
| `scripts/` | esbuild/Vite packaging and reproducible acceptance fixtures/workloads |
| `test/`, `workspace/test/`, `apps/web/test/`, `tests/e2e/` | Compatibility, domain/protocol, graph and browser-flow tests |

`dist/`, `out/legacy/`, `workspace/core/index.mjs`, `workspace/*.mjs` and `workspace/public/` are generated artifacts. There is no parallel handwritten JavaScript implementation of the core or frontend. TypeScript7 is the build-time compiler; pinned pure-JavaScript TypeScript5.9 parser is bundled for runtime AST inspection. A native compiler process is never required by the installed extension.

## Runtime and storage

The extension API remains compatible with the declared VS Code1.72 API types. Standalone Web/MCP requires external Node22.18+. SQLite stores live knowledge/coordination under the Git common directory, with safe canonical repository coordinates across worktrees and nested roots. Source annotations remain in source. Portable knowledge import is previewed and does not transfer approvals or leases. Legacy state with unknown origin is preserved and fails closed rather than inventing a location.

## Current verified state

3.0.0 local preview, developed on Mac mini. Strict typechecking and formatted new application/core source pass. 170 legacy behavior tests, 47 domain/security/protocol tests, 13 graph/diff tests and four real-browser workflows pass. Real installed VS Code activation/editor/custom tags/MCP config/service startup-stop pass. Two actual Codex worktrees demonstrated module reuse, new human guidance, conflicting claim rejection, private token recovery across turns, scoped tests and captured Review. Four independent review rounds converged from concrete blockers to PASS on the reviewed scope/coordination findings. No remote CI/Marketplace result is claimed.

## Commands

```sh
npm ci
npm run typecheck
npm run build:production
npm run test:legacy
npm run test:core
npm run test:web
npm run test:e2e
npm run verify:index
npm run package:preview
```

`workspace/README.md` is the user guide; `workspace/skills/taskvision-workspace/SKILL.md` is the Agent workflow. `agent/refactor-acceptance.md` defines the user-flow acceptance criteria. Reports stay in the existing ignored `agent/reports/` folder; raw Agent logs/lease credentials must never be published.
