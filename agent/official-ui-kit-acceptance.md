# TaskVision 3.4 · Actual React Flow UI adoption

User explicitly asks: choose a better-looking complete OSS solution and actually use it. This authorizes targeted graph UI/dependency integration, not another proposal. Baseline f9f2c13 (3.3), branch feat/official-node-kit-20261026. Preserve unrelated `.taskvision/ai-status-report.md` exactly; do not stage/publish/overwrite it. No remote push/Marketplace/default-profile replacement.

## Choice and source truth

Adopt actual first-party React Flow UI BaseNode and NodeTooltip registry source from https://ui.reactflow.dev/base-node and /node-tooltip. Raw registry JSON and SHA256 manifest are in third_party/react-flow-ui/. Adapted components live in apps/web/src/components/react-flow-ui/. This is actual copied component integration, unlike 3.3 which only imitated header/content/footer. Use their upstream Tailwind classes with Tailwind4 Vite plugin, no Preflight global reset, explicit limited @source scanning. clsx/tailwind-merge implement canonical cn helper. Do not migrate other screens to Tailwind. Preserve source notice, provenance and documented accessibility patches.

Retain working React Flow12, ELK, SmartEdge routing, source-grounded relations/impact analysis. No graph-engine replacement, new semantic model or fake relations. Built-in React Flow NodeToolbar supplies unscaled selected-node actions; official contextual zoom principle drives sparse content at far zoom.

## Visual contract / scene

Engineering workspace, ivory/graphite/moss brand. Primary need: understand architecture without a wall of tiny cards. Default canvas should breathe, not force the whole detail panel plus diagram into a small rectangle. Default project inspector becomes opt-in (button); selecting module/source still opens actual details. Keep existing functions reachable.

Node geometry is fixed by a shared `presentation.ts`: module overview264×120, file overview252×112; module detailed288×184, file detailed272×176. Node DOM and ELK use EXACT same dimensions. Top-level node title/name prominent, namespace subordinate, concise single-line real purpose/source summary; at most one or two tiny real tag/status chips. No always-visible metadata wall. Overview action row reduced; selected NodeToolbar carries full unscaled actions. Keep source/drill/expand accessible and keyboard-focusable. Details are shown in official NodeTooltip and existing inspector.

Semantic zoom: below0.68, do not shrink all detail text into unreadable tiny text; display title+file-count/critical state, hide synopsis and excess tags. Increase title enough for ~12px real text at0.5zoom, keep ports/outer geometry fixed so zoom doesn't trigger layout jumps. Above0.68 show concise overview; detailed mode shows source/labels. Touch and keyboard must reach all hidden actions via selection. No layout recompute on every wheel event.

Use wider gaps (same-layer~52–60, between-layers~108–128), no dense compaction. Smaller overview height should offset wider gaps. Preserve true topology, node drags/polling positions, explicit re-layout. Empty project, disconnected module and high fan-out still supported. Retain enough clearance for 5 relation ports (±40), do not shrink height below104.

Default graph chrome should be two/three clean rows, not four full toolbars: only show impact analysis when a node is selected; preserve its keyboard paths. Relation categories remain discoverable; never label imports as function/data flow. At rest don't draw every edge count label; show full relation label on selection/hover with evidence panel as before.

## Ownership

Node worker: ONLY apps/web/src/graph/ArchitectureNode.tsx (new), apps/web/src/graph/node-kit.css (new), apps/web/src/components/react-flow-ui/node-tooltip.tsx (accessibility patches only), apps/web/test/presentation.test.ts(new). Use provided presentation.ts read-only. No GraphView/model/layout/App/styles/manifest/build edits.
Layout worker: ONLY apps/web/src/graph/layout.ts, model.ts geometry import/lines, apps/web/test/layout-density.test.ts(new). Do not change semantics/evidence/focus logic or unrelated tests. Use presentation.ts read-only. Main handles prior compact-bound test contract if new geometry intentionally changes it.
Main: GraphView integration/extraction, App inspector defaults and chrome, presentation.ts, dependencies/Tailwind, main.tsx, build/runtime/version/licenses, browser tests/screenshots, governance, packaging.

## Required behavioral acceptance

1 Real project at1440×960 and1280×800: readable titles at initial fit; no node overlaps/clipping with settled layout; compare before/after actual screenshots, generous actual gaps. Graph occupies more area by default. No fabricated graph data.
2 Zoom out to0.5: true semantic sparse content (not same all-text card reduced), title legible and key state persists; selecting reveals unscaled actions/full tooltip or inspector; zoom doesn't move nodes or lose user pan.
3 Official BaseNode/NodeTooltip are actually rendered (data-slot/source manifest assertions), upstream classes compiled with NO global Preflight; knowledge/editor/review pages retain their visual and interaction behavior.
4 Source link, module drill/expand, keyboard selection, hover/focus details, custom labels, full paths, pending Review owners all remain real. Evidence/impact lens and relation filters unchanged.
5 Dedicated browser flow with real repo & known 8-module geometry, existing170 legacy/56 core/48 Web/13 browser regressions, TS/format/build and installed VSIX no-node_modules Web+MCP smoke. Do not preserve obsolete numeric minimum node height168 when new explicit design is120; assert typography/geometry/action usability instead. Any updated assertion must have reason documented.
6 Independent review checks focus/keyboard/tooltip dismissal and geometry/current source evidence, followed by corrections. User-owned dirty file hash must equal baseline.

## Integration findings and acceptance adaptations

The upstream fixed-side NodeToolbar clips bottom/top panels in the transformed canvas; actual screenshot/DOM reproduced it. The local API-preserving NodeTooltip patch and selected actions now use MIT Floating UI DOM flip/shift/size/hide against the actual canvas, portalled to the document body. No custom placement algorithm. BaseNode inner tabIndex is overridden to -1 so React Flow retains one primary node target; Escape explicitly restores that wrapper even when far-zoom source buttons are hidden. Three reviewer-confirmed P2 findings are covered by added real browser assertions.

Old tests were made precise about node wrappers (`.react-flow__node[data-id]`) because official toolbars also expose node IDs. The obsolete minimum168px card-height requirement was replaced by the shared120px overview geometry. Assertions for all source tags moved into the visible official detail panel, retaining truthful label coverage while allowing the requested uncluttered overview.

The preexisting `.taskvision/ai-status-report.md` generated timestamp changed during the session due to the already running plugin. It was not edited by these changes, was never restored, and is excluded from staging; no byte-for-byte preservation claim is made.
