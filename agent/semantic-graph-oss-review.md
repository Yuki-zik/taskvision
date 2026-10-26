# TaskVision graph OSS review · 2026-10-26

Question: Can we use better established open-source methods for code/architecture nodes, natural edge routing and transparent relation semantics? Research only, not an authorization to copy other license terms or introduce a new autonomous model. All candidates inspected through public project/docs and local package contracts. Existing TaskVision code basis remains a shared typed model, React Flow and ELK, with direct source tags and review state.

| Project | Tested/researched strength | Relevance | Decision |
|---|---|---|---|
| [LikeC4](https://github.com/likec4/likec4) MIT | Architecture **as a semantic model**, nested views, interactive relationship details; v1.60 (2026-10-15) adds spline/orthogonal routing switch, compact Graph/Diagram variants, fixed-size nodes; v1.57 enables merged vs distinct relationship edges | Best UX/semantic **reference** for trustworthy arch explanations | Reference now. Do **not** adopt full `@likec4/diagram` until TaskVision can map its own source-derived graph to LikeC4Model.Layouted and control view semantics; wholesale DSL/renderer rewrite is expensive. |
| [Code Canvas](https://github.com/waLLxAck/code-canvas) MIT | JS/TS/Python import graph, nodes with syntax-highlighted source and **line-anchored edges**, folder groups, expanding from selections, LSP navigation, Git state | Best direct editor/source-link reference | Reuse interaction patterns, not the entire young extension. Proposed next task: zoomed file/symbol edge anchors with verified source lines. |
| [React Flow Smart Edge v5](https://github.com/tisoap/react-flow-smart-edge) MIT | Drop-in `@xyflow/react` v12 extension, A* obstacle avoidance, rounded smoothstep/Bezier routes, hops at wire crossings, ports and per-node rerouting; Web Worker provider | Best incremental rendering upgrade, no wholesale dependency graph rewrite | **Adopt pinned 5.0.0** for dynamic routing in existing React Flow. Verify real canvas after dragging, large graph busy/fallback, and relation shapes. |
| [D2+TALA](https://github.com/d2lang/d2) MPL-2.0 | Software-architecture layout optimization for groups/whitespace/edge labels/shape sizes; TALA open-sourced 2026-09-07; D2 desktop Go and JS/WASM distribution. Can compare against ELK/Dagre in static export | Most promising **future** automatic layout A/B | Keep as isolated, optional offline architecture-export/preview experiment; stable `@terrastruct/d2` npm v0.1.33 predates 2026 TALA opening, so check real CLI/WASM version before bundling. Does not replace React Flow live editor itself. |
| [AntV G6](https://github.com/antvis/G6) MIT | Rich combos/hierarchical expand-collapse, parallel edges, edge bundling, graph analysis for huge graphs | Large-scale graph exploration | Do not migrate interactive editor just for edge routing: high rewrite cost. Consider alternate explorer only if tens of thousands of relations matter. |
| [AntV X6](https://github.com/antvis/X6) MIT | Manhattan router + rounded connectors, ports and detailed flow editing | Editor with user-authored dependency maps | No renderer migration. Borrow simple port/routing/label UX conventions only. |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) MIT | Real dependency resolution and validation rules, `json`, `dot`, `html` output for JS/TS, strongly typed schema with violations | Strong verification/parser supplement | Explore validating/augmenting TaskVision's AST scanner for unresolved aliases/cycles/architecture violations; should not run arbitrary config/scripts in untrusted repos without explicit permission. |
| [CodeMap](https://github.com/polprog-tech/CodeMap) MIT | Pure-Python CLI -> interactive self-contained D3 HTML; graph focus, bidirectional dependencies, impact chains, Git ownership, churn hot spots, collapsible clusters and six graph layouts | Best verified UX reference for **impact/fan-in/fan-out** and semantic zoom on large codebases | Adopt interaction/metrics ideas (with actual Git evidence), not a Python/D3 parallel editor runtime inside the TypeScript VS Code extension. |
| [code-map](https://github.com/abbaing/code-map) AGPL-3.0-only | Specialized React + .NET static analysis, architecture rules, submaps, runtime links and MCP | Useful domain-specific model/reference | **Do not copy code into MIT TaskVision** without AGPL obligations/permissions; currently narrower language coverage. |
| [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) MIT | Condensed main-module architecture narrative, Mermaid edges from LLM descriptions | Architectural **overview** inspiration | Human/Agent-generated descriptions require provenance and confirmation; cannot replace verified imports with AI-inferred dependencies. |
| [StructSmith](https://github.com/dziksu/StructSmith) MIT | Local-first semantic C4 model + React Flow/SQLite/MCP | Peer product shape reference | Useful for intent/relations lifecycle, limited adoption; keep TaskVision's source-code-grounded knowledge advantage. |
| [ArchFlow](https://github.com/TheAlexPG/ArchFlow) AGPL-3.0 | C4 collaboration, draft review, per-view positions, typed semantic node/edge model | Inspiration for review/presence UX | **Do not copy code into MIT TaskVision** without license analysis; self-hosted stack is much heavier. |

## TaskVision decisions

**Now**: Keep React Flow+ELK; Smart Edge v5 obstacle routing, type/dash/direction differentiation, verified source edge evidence, view-level semantic relation filter, source line jump. Import ≠ runtime call/data flow. Human review/knowledge tags remain node overlays, not fabricated graph edges. Avoid using forced mock diagrams as proof.

**Next**: Borrow CodeMap's dependency/reverse-dependency/impact/fan-in/ownership overlays, then LikeC4's separate **Diagram vs Graph** mode and merge/expand relationship UI (v1.60/v1.57); Module-first topology at default zoom, Source-centric code cards only when diving into specific file. Add user-confirmed, source-anchored `KnowledgeRelation` as **a separate semantic edge type** with `author/verifiedAt/validity` before showing any non-import architectural/dependency claim.

**Alternative comparison**: For 8–40 module maps export a D2 source snapshot and benchmark current ELK vs open TALA on the **same nodes, edges and labels**, score crossings, edge bends, total graph area, label overlap, time and visual hierarchy; TALA compiled output should not replace interactive edge paths until position and ports API have a documented stable mapping.

## Source links

- LikeC4 latest release 1.60: https://github.com/likec4/likec4/releases/tag/v1.60.0
- LikeC4 relationships: https://likec4.dev/dsl/relationships/
- LikeC4 React component requirements: https://github.com/likec4/likec4/blob/main/packages/diagram/README.md
- CodeCanvas code anchored edges: https://github.com/waLLxAck/code-canvas
- D2 TALA open announcement: https://www.d2lang.com/blog/tala-is-open-source/
- D2 JS/WASM: https://www.npmjs.com/package/@terrastruct/d2
- G6 combo collapse: https://github.com/antvis/G6/blob/v5/packages/site/docs/manual/behavior/CollapseExpand.en.md
- Dependency-cruiser output schema: https://github.com/sverweij/dependency-cruiser/blob/main/doc/output-format.md
- Smart Edge v5 docs: https://tisoap.github.io/react-flow-smart-edge/docs/

Licenses must be retained for code genuinely used; this review cites features without copying paid/proprietary examples.

- CodeMap focus/impact/ownership: https://github.com/polprog-tech/CodeMap
- code-map AGPL license and scope: https://github.com/abbaing/code-map
- GitDiagram local execution requirements: https://github.com/ahmedkhaleel2004/gitdiagram
