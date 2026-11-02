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

TaskVision **3.8.2 Preview** is the current development version. The source baseline is `520362443887d9a4562c0a753691d1595b8dd98e` (2026-10-28). The 2026-11-02 task consolidates its 13 local commits and current progress into the existing GitHub `master` branch; exact verification and synchronization status are recorded in [cloud-sync-20261102.md](cloud-sync-20261102.md) and [tasks.md](tasks.md).

The latest historical acceptance passed **188** native QUnit tests, **64** Core/HTTP/MCP tests and **107** Web tests, plus 10 Chrome workflow tests, strict TypeScript, formatting, production build and VSIX audit. The English installed Extension Host passed. Simulated Chinese hosts and 183 aligned NLS keys passed; actual graphical Chinese Extension Host verification is still incomplete because the tested host reported `en`. Some rare legacy dialogs remain English, and 80 advanced settings remain visible. See [native usability acceptance](native-usability-acceptance.md).

The existing 3.8 neon graph/detail UI, multi-project workspace, per-line guidance drafts, source evidence, scoped Agent leases and human Review are preserved. The source checkpoint is not a Marketplace release. Daily VS Code installations and private project knowledge/lease state are outside this synchronization.

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

`workspace/README.md` is the user guide; `workspace/skills/taskvision-workspace/SKILL.md` is the Agent workflow. `agent/refactor-acceptance.md` defines the user-flow acceptance criteria. Raw reports stay in the existing ignored `agent/reports/` folder. Reviewed acceptance summaries may be checked in under `agent/`; raw Agent logs, personal state and lease credentials must never be published.

## Official node UI adoption (3.4)

Actual React Flow UI registry components live in `apps/web/src/components/react-flow-ui`, with original source hashes under `third_party/react-flow-ui`. The graph-specific `ArchitectureNode` composes these components using shared measured geometry and semantic zoom from `graph/presentation.ts`. Floating UI DOM is the collision/viewport positioning boundary for screen-sized node panels. Tailwind utilities are compiled without Preflight and only scan those component sources. App context is opt-in in map view. Do not reintroduce parallel handwritten node renderers or all-detail shrinking at low zoom.

## 3.5 Source-grounded wire routing

The graph model assigns deterministic per-edge ports; layout and UI share their coordinates. Routing offers cubic wires and optional independently-routed Smart Edge A* obstacle waypoints. Overview hue encodes the importer identity; category modes encode source-backed relation type. Focus de-emphasizes sibling wires and retains direct source evidence. No new graph engine. Extreme fan-in has an explicit capacity warning.

## 3.6 Graph Studio

The workbench now has a coherent dark application theme in `apps/web/src/studio-theme.css`; `graph/GraphLegend.tsx` explains dependency semantics separately from curve geometry. Cards expose source-derived facts via `graph/node-facts.ts`, with one shared sizing/semanticzoom contract in `presentation.ts`. A readable85% default is distinct from full-mapFit; the minimap is opt-in.

`layout.ts` uses bounded route-aware local port reordering, not only neighbor centerY. `route-geometry.ts` validates/simplifies geometry, and `routing.ts` produces continuous-tangent display routes or honest literalstraight lines. `matchingRoute` tolerates only the5pxhorizontal/1pxvertical socketperimeter measurement offset, normalizing endpoints; actualnode movement invalidates stale routes. GraphView preserves these refined ports on metadata polling and does not reintroduce center-based order afterdrag. Full screenshots and corehub crop are primary visual acceptance evidence.

## 3.7 per-user, per-project studio

The Web server has a same-origin, explicitly approved Git-root registry, and every request selects a stable canonical-hash project ID (not global mutable selection). The page switcher picks a project per tab and isolates source, intent, tasks, reviews, mutations, downloads. The existing MCP/CLI remains scoped to the VS Code-selected root. Server PrivateState writes 0600 user files under a dedicated 0700 directory outside Git; projects must be explicitly registered, and unsafe/missing roots fail closed.

Personalization covers system/light/dark, nav size/collapse, inspector left/right/bottom dock and keyboard/pointer resizing, graph node positions and camera per project. Web CodeSource uses lazy Shiki TextMate with safe text spans and annotation decoration channel defaults imported from extension manifest. Effective VS Code user decorations are forwarded only when its original workspace starts the service; detached/extra roots use defaults. Contrast adaptation on light is intentional; dark retains original colors. Unresolved ThemeColor/font metrics cannot be pixel-matched. Source is never executed. All aspects documented in agent/personal-workspace-acceptance.md.

## 3.8 GitHub heritage neon, float details, native VS Code

Original appearance source is the screenshot resources/PixPin_2026-02-21_01-04-22.png: black code background, colored tag-only neon glow, translucent full-line glass outline. apps/web/src/neon-heritage.css and apps/web/src/graph/node-detail-popover.css style dark graph and source-linked floating details. The default for new Web projects is dark; previously stored user preferences override it. The native VS Code decoration pipeline remains the four-channel authority for source highlighting. Built-in CORE/REUSE/INTENT/REVIEW defaults add neon+glass tag glow and low-alpha whole-line glass while keeping original colors.

A single graph click/keyboard Enter opens one Floating UI popover with true node facts/provenance; double-click drills, canvas navigation dismisses, and full fixed inspector opens only via explicit action. Native tree title focuses on Open Workspace, Refresh and grouped Quick Actions, preserving legacy right-click menu and user-customized settings. Real installed VS Code screenshot plus browser screenshots and acceptance docs are in the local workbench. Do not reintroduce a generic white/light admin card as the default without explicit user request.

## 3.8.1 source-anchored unsaved guidance

New Web AnnotationEditor drafts are keyed by canonical project workspace ID, source path and line; existing saved annotations keep their stable annotation IDs. A matching older path-only draft is migrated only after its line-accurate new key is successfully persisted; mismatched legacy user data remains untouched. Navigation between lines, browser reload, concurrent editing, legacy migration and other human/Agent Review flows are tested through the real server and browser. Release acceptance and package checks are documented in [guidance-draft-acceptance.md](guidance-draft-acceptance.md).

## 3.8.2 native VS Code usability and bilingual menus

The opt-in native Getting Started QuickPick provides three workflows (read annotated source, launch the Web knowledge workspace, copy Agent MCP config) and an explicit Node.js 22.18+ troubleshooting entry. The main Quick Actions picker still defaults Enter to Open Knowledge Workspace. Native Activity Bar is TaskVision, its tree is Tasks & Knowledge / 任务与知识. All 80 native configuration entries now have translatable group/description/validation metadata; both language packs have 183 keys. Native tree filter/session/scan labels, appearance presets and highlighter scopes, common task status/priority/note/tag dialogs use bilingual display labels. Persisted enum/source tokens, user settings, Web and Agent protocols remain unchanged.

Verification: 188 QUnit, 64 Core/MCP, 107 Web, 10 Chrome, TypeScript, formatting, production bundle and VSIX audit. Isolated installed VS Code 3.8.2 passed English Extension Host command/settings/browser/MCP smoke. Chinese pack installed in isolation, but VS Code Extension Host remained vscode.env.language=en even with requested zh-cn; real Chinese GUI verification remains open. Simulated zh-cn native hosts and static NLS checks pass. Some rarely used legacy dialogs retain English. The 2026-10-28 acceptance did not publish or replace the daily VS Code profile; see [native-usability-acceptance.md](native-usability-acceptance.md). Source synchronization is recorded separately in the current checkpoint.
