# TaskVision impact lens + layout feasibility · 2026-10-26

## User's actual goal
Graph is understandable to humans/Agents. Continue OSS comparison, implement high-value interactions using existing React Flow + ELK instead of gratuitous engine swap. Must not invent dependency calls/data flow/semantic impact. User's preexisting `.taskvision/ai-status-report.md` edit is off-limits. No global install/publish/push.

## New behavior: Source-grounded graph lens

- CodeMap-inspired focus lenses for selected module/file: **直接依赖** (outgoing A→B), **依赖它的模块** (incoming X→A), **变更影响范围** (transitive reverse reachable predecessors), **邻域** (both 1-hop), and **全图**. Impact is static POSSIBLE blast radius based on *observed resolved import* edges, not proof a change breaks an importer.
- Exact arrows stay A→B = A imports/depends on B, even when an impact path traverses B→A in the reverse direction; do not reverse graph arrows to fit UX story.
- Lens must work on same snapshot, same module scopes and same relation category filters; no hidden changes to source evidence or counts. Distinguish depth/hops, counts of direct vs transitively reachable nodes. Cycles are handled with visited set and bounded traversal; do not count selected node as impacted. Unconnected nodes remain visible but muted (or user-selectable isolate mode) to retain spatial orientation. Switching lenses/selection must not reset pan/zoom or trigger needless ELK relayout.
- Expose a clear path description and scope warning: unresolved imports/dynamic execution/filtered categories/structural simplifications mean impact is conservative. Hover/focus highlights correct arrows, clicking real edges continues to open original evidence. Accessible keyboard and screen-reader labels.
- Test: exact direct/incoming/transitive and cycle/back edge; same edges in reverse appear with correct orientation; mixed relation type filters; no false impact beyond disconnected branch; at least 2 graph fixtures incl a real TypeScript mini-repo; E2E active lens, jump to code and 2-second polling viewport retention.

## Layout alternative (research, no runtime dependency)

- Retrieve actual open D2 v0.9/TALA binary or JS/WASM from official release if feasible, isolated under ~/agent-machine/workbench/taskvision-impact-tala-20261026; verify version and license. Export the same TaskVision module+resolved edges with labels to a deterministic D2 source fixture, with no user secrets, and render ELK-vs-TALA. Inspect actual imagery, timing, crossings, bend count, node overlap and readable text; note differences in engines and renderer. Choose whether to adopt as an optional offline helper or defer. NEVER represent a nonexecuted layout as benchmarked.
- Do not add unrelated runtime Python/Go or a second source of truth. Keep source-grounded relationship contract and existing MCT metadata.

## Ownership

- Worker A: apps/web/src/graph/impact.ts and apps/web/test/impact.test.ts only: pure generic deterministic analysis, tested.
- Worker B: scripts/compare-architecture-layouts.mjs, isolated benchmark files under ignored ~/agent-machine/workbench/taskvision-impact-tala-20261026/, and technical report agent/impact-layout-research.md (no existing module edits). Can use external download tools for **official public release only**; no global installations.
- Main: integration into apps/web/src/graph/GraphView.tsx and CSS (main-owned), new tests/e2e/impact-lens.spec.ts, acceptance/regressions, docs/version/build/package, final reviewer. Do not modify worker files until handoff.

## Completion criteria

1. Pure analysis verified with realistic graph direction/cycle/filter tests.
2. Real Chrome interactions at 1440/1280/390, no node overlaps or hidden critical control, manually zoomed graph stays zoomed across switches/polls.
3. Old 170 QUnit, new core52 and web31 tests preserve behavior; all previous 5 browser flows pass; new impact E2E passes. Strict TS/Prettier/build package pass.
4. TALA comparison either demonstrably executed on matched graph, or explicitly marked infeasible/unsupported with fallback; no fabricated timing/visuals.
5. Independent read-only code/product review flags only grounded usability/semantic bugs; fix and re-test. VSIX isolated, daily 2.0.1 remains unchanged. Do not stage user's `.taskvision/ai-status-report.md`.
