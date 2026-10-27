# TaskVision 3.5 - Distinguishable dependency wires (ComfyUI-like)

User approved improving the live Mac mini project's dense, overlapping graph edges, with no new graph runtime. Preserve all source-backed dependency semantics, evidence and security. Branch `feat/comfy-wire-lanes-20261026` from3.4. `.taskvision/ai-status-report.md` already has user-owned generated changes; NEVER stage/revert/overwrite or treat it as part of this task. Do not push/publish/default-profile install.

## Problem / desired user behavior

Current `SmartEdge` avoids nodes, but links from different nodes share category-level ports and may use coincident A* channels. Parallel relation kinds to a common target are difficult to follow, especially during drag/zoom. Solving only colors or line thickness is not enough. No fabricated dependencies. Arrow remains importer->provider, category semantics unchanged.

## Implementation design

- Keep ReactFlow12, ELK layered, existing SmartEdge v5; no Rete/ComfyUI implementation or new graph runtime.
- GraphModel allocates stable per-visible-edge ports on both ends, sorted by target/source key and relation category. Source/target Port y-values stay within actual measured node rectangle, at least 16px from corners. Cap visible physical slots with explicitly documentable congestion behavior. Runtime relation count and evidence unaffected. Port allocation stable across snapshot polls and reorder, returns port metadata for rendered node and ELK port declarations. Layout nodes and port positions must agree exactly; preserve existing labels/selected action UI.
- For distinct parallel routes, use ComfyUI-like visually smooth Bezier strokes when an obstacle-free path exists, with per-edge lane variation/waypoint and separate labels. When obstacles exist, use existing SmartEdge routing, but check shared corridors and spread lanes with deterministic per-edge waypoint where feasible; avoid straight line cutting through nodes. Existing ELK fallback must not use an obsolete path after a drag.
- Cursor hover/keyboard focus emphasizes only connected source/target and their edges; other connections fade. Edge hit targets must remain selectable, labels not clutter graph at rest, source-proof panel unchanged. No mislabelled execution/dataflow.
- Display honest edge metadata and grouped counts: summary for broad overview, category mode for fine-grained inspection. If there are many wires, provide explicit one-neighbor-focus/cycle capability rather than pretending all can be untangled at once.

## Real acceptance (avoid meaningless tests)

1. Same source fixture with 2+ importers sharing a provider, plus 3+ different category edges for same pair, produces distinct ports/paths that can be selected independently. Underlying evidence count/direction/line remains exact.
2. Geometry checked for distinct end positions and minimum visible separation at exit/entry and representative midpoints, and no path going through unrelated node boxes in typical routed layout. Prove no stale endpoint after dragging.
3. Browser tests at desktop1440, laptop1280 and narrow390: graph renders, no JS errors, edge click reveals proper source file/line; hover and category toggle do not erase source evidence; zoom/poll preserves manual changes. Inspect actual before/after screenshots.
4. Strict typecheck, graph, core and old extension tests. VSIX packaged runtime/web still works with 11 MCP tools; no extra graph library added, no user data changes.
5. If exhaustive collision elimination for arbitrary graph is impossible, disclose clear limits; prefer visibly distinguishable, conservative routing over a false guarantee.

## Observed before and after

On TaskVision's real source graph, four independent importers formerly converged on the same center of core's port and shared a long visible segment. The new model allocates each dependency its own in/out port, with actual DOM and ELK Y coordinates agreeing to subpixel precision in the real browser. Independently shaped cubic wires are rendered in clear corridors. When an unrelated module blocks a corridor, the installed Smart Edge A* routeSmartEdgeBatch reproducer confirms distinct horizontal midlanes (-32/-56/+192) and no obstacle intrusion.

The initial peer review identified two concrete problems: overlapping blocked A* paths and node emphasis defeating single-wire focus. Both were reproduced and corrected with waypoints and focus priority. A later comparison of selecting evidence wire A before hovering B found the selected flag restoring emphasis; this was fixed and a dedicated real-browser regression added.

Typical 8-module graph has 11 real dependencies, with distinct endpoints and optional labels. The source colors encode real importers, category colors encode relation kind. High fan-degree can exceed node port capacity; focus/filter remains available and no source records are dropped.
