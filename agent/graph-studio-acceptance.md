# TaskVision 3.6 Graph Studio — explicit visual rejection remediation

User supplied a screenshot of 3.5 and explicitly rejected: kinky/braided fan-in/fan-out wires; outdated coarse interface; too little visible node information; missing expressive curve styles and clear legends. User said continue. This authorizes targeted renderer/layout/node/interface changes in current Mac mini repository, not another list of projects or a mock image. Baseline3400916; branch feat/graph-studio-20261027. Preexisting `.taskvision/ai-status-report.md` is excluded from edits/staging/restoration. Do not publish/push, change default VSCode profile, alter knowledge databases or deploy an unrelated app.

## Visual direction

A coherent charcoal/graphite code-intelligence workbench inspired by ComfyUI's useful port/card conventions, not its execution semantics. Dark neutral canvas #10151f, raised slate node surface #1b2332, restrained cyan/blue accents, bright enough source-type colors, readable actual stats/tag chips. No big green/beige blank rounded boxes. Main owns shell/toolbar/legend theme; node worker owns card content/design. Keep official MIT BaseNode/NodeTooltip and existing ReactFlow/ELK/SmartEdge. No new runtime dependency.

## Content truth

Cards show basename+path, real source-linked summary (up to2lines), all nonzero CORE/REUSE/INTENT/REVIEW/TODO chips simultaneously; file count, lines, unique referencing/dependency modules computed from actual ports; pending reviews and claimed Agent names shown distinctly. Empty states say no tags/unclaimed, not 'healthy' or made-up progress. REVIEW source hotspot count and pending review task count must not be conflated. Full details/keyboard/source navigation preserved. Far zoom may simplify, but default overview must retain readable stats/chips.

Shared node dimensions from presentation.ts only: module overview304x196, detailed328x248; file overview292x184,detailed316x236. Low-zoom map threshold0.48 rather than hiding content below0.68. Node center ports reserve at least24px from corners and >=18px typical degree<=8. No bottom-right huge filled arrows: Main uses fixed userSpaceOnUse small open-chevron markers (9px) and arrowless/capped terminal behavior when <.4zoom if needed.

## Routing design and acceptance

Old port ordering by counterpart alphabet can contradict actual screen order; old two-cubic with horizontal midpoint tangent creates a kink. Use geometry-aware port order and proper horizontal endpoint tangents. Default smooth path should be one cubic for a clear source→target corridor. Obstacle polylines must be simplified (duplicate/collinear/spurious backtrack removal) and rendered with continuous-tangent rounds. Never display stale ELK routes after a drag. Never let SmartEdge.cached svg preempt a valid clear curve.

Layout must use actual edge-edge spacing and crossing minimization; preserve all source-backed dependency metadata, stable ids, evidence. Add at most a bounded second spatial refinement pass: sort inputs by source physical Y, outputs by target Y, stable category tie; then align returned ELK ports/data. Main must preserve layout-refined wirePorts when merging fresh model metadata or polling. RetainPosition/manual drag should not reroute against wrong endpoints.

Provide exported route display API from routing.ts: `ConnectionStyle='flow'|'orthogonal'|'direct'`; `displayRoute(points,style,radius?) -> {path,center}` or equivalent documented actual API. Direct mode must label itself as literal straight connection and disclose that it can cross nodes; defaultflow andorthogonal avoid unrelated nodes. Old helpers may remain for compatibility, but production should not double-route or reuse noisy grid SVG as its final appearance. Existing SmartEdge router may supply raw points for obstaclefallback; don't implement a new general A*.

Actual visual fixture: several sources above/below a core with naming reverse to screen order; samepair runtime/type/reexport/dynamic; a provider right of core; one unrelated blocker. Verify distinct18px ports typicaldegree, no sibling path intersections in last60px of targets/first60px ofsources, no tinyhook/backtrack loop, smallarrows. Measure sampled SVG paths and port order; screenshot1440 and1280 at comparableactual zoom and200%crop of core. No relying just on total tests passing.

## Worker ownership

Routing worker: ONLY graph/layout.ts, graph/routing.ts, new apps/web/test/studio-routing.test.ts. May add graph/route-geometry.ts. Do NOT edit GraphView/model/renderer/presentation/CSS. Main integrates your exported spatial-port ordering helper and path renderer. Existing ports inmodel may be alphabetical; return revised wirePorts inlayout. Read official ELK/ReactFlow docs already available; existingdependenciesonly.
Node worker: ONLY ArchitectureNode.tsx, node-kit.css, presentation.ts, new apps/web/test/node-facts.test.ts, optional graph/node-facts.ts. Do NOT edit GraphView/model/layout/routing/otherCSS. Use existing data fields; incomingoutgoing fromwirePorts. Main imports renderer as before and updates theme/legend/toolbar. Keepexisting data-slot/class hooks and real sourceactions.
Main: GraphView edgepipeline/toolbars/legends, shellCSS/App/main entry, model stats only if essential, tests/e2e, build/version/docs/commit/package. Main runs browser and independent reviewer after handoff; do not self-approve.

## Acceptance

- Visible modern, coherent real page and useful node summary at desktop normalzoom. No fake data, no image-only preview.
- Geometry proves typical fan-in is sorted and separate near sockets; C1smooth/nohooks and reducedarrow size. Literal mode & semantics clearly explained.
- Permanent compact legend plus expandable full legend: relations/linepatterns, color encoding summaryvs category, arrowdirection, node tags, actualreviewvs REVIEWhotspot, generated estimates.
- Rich cards remain legible with cursor/keyboard/mobile action reach. No sidepanelcovering mainports. Meaningful screenshot closeups not just fullscreenscaleddown.
- StrictTS, oldcore/plugin tests, sourceevidence tests and appropriate browser scenarios. Previously tiny-card dimensions/full-fit assumptions may change only with documented intentionalnew contract; never remove underlyingbehavior coverage.
- Exact VSIX packedruntime smoke after final build, no auto-defaultinstall. State remaining real boundaries honestly.

## Implementation findings and intentional contract changes

- Distant neighbor centers alone failed the actualMCPfan: coreprovider andsharedprovider were only9pxapart vertically but routingobstacle dictated opposite local order. The repaired helper uses validnear-socket routeordinates, with stableidentity/provenance, andboundedELKrefinement.21actualsiblingnear-port comparisons passed.
- A3px difference between ELK bordercenter and ReactFlow socketperimeter discarded correctELKpaths and introducedgridhooks. matchingRoute now normalizes≤5pxX/≤1pxY measurementdelta toactualendpoints; actualnode moves invalidate.
- The old default fullFit shrank richmetrics to6px. The initial85%readingview now keeps≥10px actualmetrictext; a separateFit operation explicitly showsallnodes. Tests that assertallnodesinsidecanvas useFit; no claim thatarbitraryrichgraphs allfitreadably inasmallscreen.
- The old168/120pxcardbounds were replaced by explicit196pxrichcardgeometry. Counterpartportgeometry checks comparethe refinedlayout'sports ratherthanprelayoutalphabeticports. Highcapacitytest uses180sources toexceednew165pixelslots while stayingwithinits200filefixturebudget. Alllogicaledge/evidenceassertionsremain.
- Reviewerfoundsearch/taskcontrast,filterselectedclass mismatch, too-smallmetrics,and minimapoverlap. Styles nowmatchactualselectors, defaultreadmodepreservesfont, andminimapstartsclosed. Tooltipactiondismissal andEscapehover suppression avoidstaleportals coveringexpandedsourcefiles.
