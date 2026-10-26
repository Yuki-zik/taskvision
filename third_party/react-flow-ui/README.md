# Vendored React Flow UI

Actual first-party component source downloaded 2026-10-26 from https://ui.reactflow.dev/base-node and https://ui.reactflow.dev/node-tooltip, following https://reactflow.dev/ui/components/base-node manual installation. This differs from the prior3.3 design which borrowed composition only.

The raw registry JSON is preserved beside this file. `manifest.json` records exact source/registry SHA-256. The official UI documentation footer links https://github.com/xyflow/xyflow/blob/main/LICENSE (MIT); that notice is retained in `licenses/react-flow-ui-LICENSE.txt`.

Application components live in `apps/web/src/components/react-flow-ui`. BaseNode preserves upstream structure/classes, with the `cn` import redirected to the local canonical clsx/tailwind-merge helper. Local documentation comments and formatting are allowed. NodeTooltip adapts focus/dismissal and event composition for keyboard accessibility; the integration does not grant new application permissions. Exact patches are visible in Git against the retained originals.

Tailwind4 utilities are compiled with a bounded @source list and no Preflight. The rest of the app keeps its existing CSS. Geometry, content budget and semantic zoom are TaskVision-specific adaptations; ReactFlow native NodeToolbar retains screen-size text when the canvas zooms out. No new fonts, remote assets or runtime network calls are required.

## Integration corrections

BaseNode remains an upstream copy with local import/formatting. The application sets `tabIndex=-1` on its inner card, keeping the existing React Flow wrapper as the sole primary keyboard target. NodeTooltip retains the upstream context/trigger/content API, with local focus, delayed hover and Escape handling. Its content and selected actions now use a small `FloatingNodePanel` adapter over the MIT Floating UI DOM package: flip/shift/size/hide against the actual canvas, portalled outside transformed clipping. This avoids tiny or inaccessible controls at low zoom. The selected action UI retains screen-sized behavior but uses this bounded adapter instead of a fixed-side NodeToolbar.
