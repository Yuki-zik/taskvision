# TaskVision Web

Chinese-first React workbench. This directory owns only the frontend; root dependencies, shared domain types, transports, and governance remain main-thread responsibilities.

The implementation reuses the semantics documented in `workspace/CONTRACT.md`, the old `workspace/public/app.js` source-comment and Web-note behavior, and the shared `packages/shared/src/types.ts` contract. The static SVG and imperative rendering are replaced with React Flow custom nodes and an ELK layered orthogonal graph. No example templates or commercial React Flow components are copied; attribution remains visible.

## Integration

- Build from the repository root: `npm exec vite build -- --config apps/web/vite.config.ts`.
- Strict check: `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json`.
- Focused behavioral tests: `node --import tsx --test apps/web/test/graph.test.ts`.
- Production assets are generated into `workspace/public`, with `/` base and a clean output directory. The server must serve `index.html` and `/assets/**` with their normal MIME types.
- HTTP reads: bootstrap, snapshot, source, export, and `/api/reviews/:id`. Mutations use `/api/operation` and `X-TaskVision-Token`. There is no frontend-only mock API or shipped sample data.
- **CSP:** React Flow positions nodes with inline style attributes. Keep `style-src 'self' 'unsafe-inline'`; keep `script-src 'self'`. Fonts and icons are local. ELK is a dynamically imported local build asset, not a remote worker or CDN resource.
- The ELK bundle is about 1.43 MB before gzip (about 442 kB gzip), and Vite reports its chunk-size warning. It is loaded separately from the roughly 470 kB application bundle. No dependencies are added outside those assigned by main.

## Behavior

The default map aggregates real code files at application/package boundaries, treats `src` as one module, and consolidates tests. It starts with no expanded modules. Configuration, documentation, licenses, scripts and generated workspace files remain accessible through a separate, counted infrastructure view. Root files have their own navigable scope. The overview/details switch changes information density; expansion shows at most four files with the visible total and a drilldown to all scoped files.

Layout uses compact ELK layered routing with disconnected-component packing. On the current repository, the eight-module overview occupies about 860×544 logical pixels. Initial fit waits for measured nodes and keeps zoom at or above 80% (236px nodes render at least 189px wide; 14px summaries remain above 11px). Smaller screens pan through this readable canvas rather than shrinking all modules into a thumbnail. React Flow's automatic `fitView` prop is intentionally absent. Manual positions and viewport remain unchanged across polling, filtering and expansion; returning to an existing scope restores its viewport. Relayout is explicit. Selection/hover emphasizes actual import edges; grouping never fabricates dependency lines.

Selection links the map, file knowledge, source line numbers and symbols. The initial inspector shows a concise project introduction and four diverse source entrypoints/reuse references instead of full global INTENT entries. Human guidance and source-comment editors retain revision/hash with a local draft, and never silently rebase on polled changes. Summary/body limits match the server (2000/16000 characters). Conflicts retain text and offer explicit comparison/rebase. Proposal decisions are available only for pending editable Web proposals, never source REVIEW or legacy records. Review reads server-provided `ReviewDetail` and renders actual before/after text and hashes; missing baselines and stale reviews cannot be accepted. Task creation includes paths and dependencies. Import is limited to 2 MiB, requires a server dry run, displays duplicates/conflicts, and requires a separate explicit confirmation; project changes invalidate a prior preview.

## Verification handoff

Strict TypeScript, the production Vite build and 13 focused behavior tests passed in the worker environment. Tests verify semantic module grouping, visible infrastructure counts, distinct root scope, bounded expansion, real edge direction, no invented containment edges, compact layout bounds, retained manual positions, source/reuse entrypoint selection, editable-proposal eligibility, symbol search, neighbor focus, nonoverlapping ELK positions, edge segments avoiding unrelated nodes, and bounded large-file diffs.

Browser acceptance remains with main: this worker sandbox rejects a loopback listener with `listen EPERM`, so it cannot honestly claim screenshot or interaction acceptance. Check 1440×960, 1280×800 and 390×844; source and diff scrollers are locally constrained, the small-screen navigation moves to the bottom, and details become a dismissible full-width pane. Exercise draft retention across polling/reload/conflicts, import preview/confirmation, real review diff, proposal accept/archive and task dependencies against the integrated server.
