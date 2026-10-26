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

## 3.2 dependency impact and layout comparison

`apps/web/src/graph/impact.ts` implements CodeMap-inspired five-mode static graph exploration (all, dependencies, direct dependents, reverse-transitive possible impact, 1-hop neighborhood) over **existing source-grounded** dependency arrows. Source→target still means the source imports the target. Direct/indirect affected counts exclude the focus; expanding a module preserves displayed child-file representatives as zero-hop seeds. Mouse and keyboard selection share one activation path; opening edge evidence preserves context. The UI highlights without relayout or mutating the graph and labels impact as possible review reachability, not runtime breakage.

`scripts/compare-architecture-layouts.mjs` offers deterministic D2 source export and actual ELK layout geometry measurements with six focused tests. A real Mac mini default run generated D2, ELK SVG and comparison JSON in an isolated workbench (8 modules, 11 relations, no unrelated-node route intrusions, one proper crossing, 22 bends). **TALA was not executed**: official arm64 binary/JS package unavailable to the execution environment, so the alternate engine remains a documented candidate and its metrics null. No runtime D2 dependency was introduced. See `agent/impact-layout-research.md` and `agent/impact-layout-acceptance.md`.

The 3.2 preview retains the existing extension, 11 MCP tools, and Web. Verified local suites: 170 original plugin tests, 52 domain/security/protocol tests, 48 Web graph/impact tests, six browser user workflows, and six export/geometry tests. Strict TS and formatting pass; installed VSIX and standalone Web/MCP also validated. No remote release or cross-platform graphical Host certification is claimed.

## 3.2.1 historical Review compatibility

Legacy 2.1-era records lacked claim-time source baselines. In the Web Review page, old commit vs current HEAD is explicit and unsupported before/after comparisons are never reconstructed using current source. Detail requests return metadata-only when no baseline instead of an HTTP 403 caused by newly ignored historical paths. Modern reviews retain permitted file diffs but mark the whole review unapprovable if any historical evidence is excluded. Human-only approval now checks claim-time and submitted completeness, the current visibility of both baseline and submitted paths (including intentionally deleted files), workspace identity/HEAD and current source fingerprints. Canonical empty root scope remains valid for nested checkout reviews.

Independent two-round read-only review found and verified repair of two additional P2 approval inconsistencies. Acceptance: 170 legacy tests, 56 domain/security/protocol tests, 48 Web tests, 10 real-browser workflows, strict TypeScript/format, isolated VSIX/Extension Host and MCP smoke. No existing database review was automatically accepted/rejected. No daily VS Code version or remote files changed. Repro and evidence: `agent/reports/taskvision-3.2.1-review-acceptance.md`.

## 3.3 visual architecture nodes

The Web still uses the original ReactFlow12 + ELK layout + MIT Smart Edge path routing; module and file nodes now use a single local React/TSX Header/Content/Footer component inspired by the first-party [React Flow UI Base Node](https://reactflow.dev/ui/components/base-node) and LikeC4 semantic architecture hierarchy. Native CSS only, no Tailwind/shadcn addition. Module overview/detailed geometry 264×168 / 272×190; file overview/detailed geometry 252×164 / 260×180. Every card exposes actual path, basename, file count/type, source-backed summary, applicable semantic tags plus overflow, and real owner/review/knowledge state. Existing source jump, drill, expand, keyboard and ports retained. `apps/web/src/graph/model.ts` matches DOM/ELK geometry exactly.

The initial and both Fit controls use adaptive bounds rather than cropping at a hard 75% floor. Real TaskVision overview 8/8 modules within desktop bounds without minimap covering any card; realistic eight-module Chrome fixture validates 1280×800 after initial and both Fit actions, with event-driven wait for actual layout completion. 390 viewport no overall page horizontal overflow; the graph remains pannable. Below 60% zoom text becomes hard to read; semantic zoom by reducing overview detail is a future improvement, not claimed here.

Validated strict TypeScript, Prettier, 170 old tests, 56 core, 48 Web, 13 real-browser workflows and 6 layout-tool tests; installed 3.3 VSIX and bundled Web+MCP tested on Mac mini. No new runtime dependency, no change to VS Code 2.0.1 user's default profile or historical Review state. See `agent/node-design-acceptance.md` and `agent/reports/taskvision-3.3-node-design-20261026.md`.

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

## Official node UI adoption (3.4)

Actual React Flow UI registry components live in `apps/web/src/components/react-flow-ui`, with original source hashes under `third_party/react-flow-ui`. The graph-specific `ArchitectureNode` composes these components using shared measured geometry and semantic zoom from `graph/presentation.ts`. Floating UI DOM is the collision/viewport positioning boundary for screen-sized node panels. Tailwind utilities are compiled without Preflight and only scan those component sources. App context is opt-in in map view. Do not reintroduce parallel handwritten node renderers or all-detail shrinking at low zoom.
