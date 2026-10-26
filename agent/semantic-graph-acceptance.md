# TaskVision semantic architecture graph · 2026-10-26

User objection: current external Web graph has crude nodes/unnatural connections and does not clearly distinguish relationships. Authorize targeted graph improvement on Mac mini, branch feat/semantic-graph-20261026; preserve all existing extension/MCP/knowledge workflows. Original user change `.taskvision/ai-status-report.md` is PREEXISTING and must NEVER be staged, overwritten, or reverted. Do not push/publish/install into daily VS Code profile.

## What to reuse (search-first)

- Existing React Flow v12 + ELK layered layout provides graph interaction and initial node positions. Official React Flow free custom-edge/label examples are MIT; do not copy paid Pro examples.
- Adopt maintained `@tisoap/react-flow-smart-edge@5.0.0` (MIT, React Flow v12 peer). SmartEdgeProvider + useSmartEdgePath for worker-backed obstacle avoidance on drag, with fallback to ELK/builtin paths; do not reimplement A* or routing.
- The current source AST analyzer in `packages/core/src/syntax.ts` is canonical for evidence. Reuse it instead of inventing heuristic links.
- Visual direction: serious code-intelligence tool, not a node-based automation builder; preserve restrained graphite/ivory/moss app chrome, make node hierarchy and relation vocabulary explicit, visible at default zoom. Relationship clarity > ornaments.

## Shared evidence contract

Add to `packages/shared/src/types.ts`:
`SourceRelationKind = 'runtime-import' | 'type-import' | 're-export' | 'require' | 'dynamic-import' | 'lexical-import' | 'import'` (legacy fallback);
`SourceEdge {from:string;to:string;kind:SourceRelationKind;provenance:string;line?:number;specifier?:string}`.
Evidence direction: `from` is the SOURCE that imports/loads/re-exports `to`, i.e. arrow **A→B means A depends on B**. It is never a function call or actual data flow unless separately proven. JS/TS classification comes from AST (`import type`, `export ... from`, `require`, `import()` etc). Conservative fallback for unsupported languages is lexical, explicitly less certain. Only resolved same-repository references become edges; no inferred call graph.

UI group categories, with evidence detail preserving exact kinds:
- `runtime`: runtime-import + require + legacy import
- `type`: type-import
- `reexport`: re-export
- `dynamic`: dynamic-import
- `lexical`: lexical-import (visible with estimated/lexical provenance)
Do not introduce speculative Agent ↔ Agent or knowledge ↔ dependency arrows. CORE/REUSE/INTENT/REVIEW and Agent owner are semantic node overlays, separate from source-code edges. Build true node/edge evidence panel on click: count, direction text, grouped relation kind, actual source/target file path, line and imported specifier, source jump. No fake counts; cap only displayed evidence with explicitly disclosed omission.

## User-flow acceptance criteria

1. On live TaskVision project overview, draw clean source-grounded dependency map with directed, legible arrows and no edge through node card interiors at rest; moving a node triggers fresh routing around obstacles. Nodes readable without zooming to 200%; if layout exceeds viewport, reveal via pan/minimap instead of shrinking everything. Controls always reachable.
2. Relation variants differ in more than shade: continuous runtime, dashed type, subtly distinct re-export/dynamic, dotted lexical; legend says what direction means and does NOT claim calls or data flow. Filter by relation kind, show counts. Isolated/unknown relations are not fabricated.
3. Clicking an edge reveals verifiable code evidence (actual from/to, source line, import specifier, relation kind). Clicking an evidence item navigates to source. Other Agent/knowledge annotations stay nodes, not fake links.
4. User can drill modules, expand files, select nodes, hover focused edges, drag nodes, zoom and reset layout; no loss of saved view on 2s refresh. If a node is moved, old ELK route must not continue as if current.
5. Graph model tests verify exact aggregation/counts by relation category, direction and true evidence; syntax tests validate `import type`/type-only named imports, `export ... from`, `require`, `import()`, and exclude string-literal false positives.
6. Existing QUnit, workspace core/protocol, graph/diff, browser Web workflows pass. Browser acceptance uses REAL source examples in a clean fixture + full TaskVision repo, desktop1440, laptop1280, mobile390; check off-node obstacles, edge click inspector, keyboard/hover, no React errors. No brittle styling snapshot assertions.
7. Strict TypeScript and production VSIX bundle pass with new dependency. Independent reviewer checks semantic correctness and DOM accessibility. Maintain MIT notices for new dependency.

## Worker ownership

Core: `packages/shared/src/types.ts`, `packages/core/src/syntax.ts`, `packages/core/src/scanner.ts`, add `workspace/test/semantic-graph.test.mjs` only. No UI, package, docs or agent governance.
Web: `apps/web/src/graph/**`, `apps/web/src/components/RelationDetails.tsx` (if needed), graph-specific `apps/web/src/styles.css` section only, add `apps/web/test/relations.test.ts` only. No core/types, no package, no agent governance. Assume contract above will be implemented by the core worker.
Main: dependencies/CI, cross-component integration, new browser test/evidence fixtures, screenshots/design review, docs/governance, commit. No modification of another worker's files while active; send deltas on integration errors.
