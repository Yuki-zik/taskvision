# TaskVision 3.3 — Architecture node design rebuild, 2026-10-26

User observed node cards are unattractive; asked whether mature OSS component implementations can be adopted. This task is authorized in-context. Repo ~/Code/taskvision on feat/graph-node-system-20261026. Preexisting user-owned .taskvision/ai-status-report.md modification must NEVER be overwritten/staged. Do not publish/push or replace the daily VS Code2.0.1.

## OSS rationale and scope

- Existing renderer and interactions: @xyflow/react 12.12.0, ELK and MIT Smart Edge. Reuse all, do not migrate graph engines.
- First-party [React Flow UI Base Node](https://reactflow.dev/ui/components/base-node) is a ready-to-copy MIT header/content/footer composition; first-party Node Status Indicator and Node Appendix inform status/annotation placement. LikeC4's hierarchical architecture node design is the domain-specific composition reference. The official shadcn/Tailwind4 registry would require globally adding Tailwind/shadcn to this established CSS workbench; instead bring the proven **BaseNode composition and interaction conventions** into a local React component using native CSS (no shadcn/Tailwind migration, no new runtime package).
- Prefer calm technical cartography, existing graphite/ivory/moss system, module/file roles distinctly expressed, strong information hierarchy at default 75% zoom. Do not make every card same generic tile; module is a bounded architecture unit, file is a smaller code artifact. Avoid unnecessary gradients, blurs, fake metrics, 20 different status colors, decorative CSS dots/eyebrow labels with no semantics.

## Required design

- Keep real source annotations, counts, file scope and Review state. A module shows namespace (e.g. apps / packages / src), actual basename and exact file count, meaningful two-line summary, at most 2 semantic tags plus accurate overflow count, honest role/status footer. A file shows file type, basename and parent path, actual summary, tags. Neither may invent calls, ownership, test results or business metrics.
- Share one reusable React Flow UI-inspired BaseNode structure: header (kind/path/title/keyboard accessible action), content (summary/source jump), footer (tags/counters/expand). Distinct restrained variants based on code path and module/file identity. Reading order is title > summary > details > actions; retain visible existing actions for drill and expand.
- Accessible native button labels; use nodrag nopan for actual interactive controls; selected/focused/hovered/pending review states visible with contrast. Keep category edge handles and arrow endpoints intact; avoid drawing lines through card interiors. No UI action invented.
- Default 1440x960 actual 8-module TaskVision graph, at default fit, cards should be legible. Avoid horizontal/vertical clipping; page has no overflow. 1280x800 laptop and 390x844 mobile keep primary controls. Long names/paths wrap or truncate with full tooltip. Editing semantic tags/review counts remains accurate.
- Graph nodes rendered at width roughly 246–272 and height 164–190, measured geometry MUST match layoutGraph's `width/height` and DOM, including overview vs detailed, module vs file. Do not silently add 30px CSS height to a node sized smaller in ELK or break port alignment.
- Preserve Card navigation, drill, expand/collapse, source annotation jump, keyboard activation, drag, viewport on poll, relation inspection, impact lens and all other UI flows. Model/source graph calculation untouched except explicit node geometry fields.

## Acceptance (not shallow unit count)

1. Screenshot before and after on real TaskVision project at 1440x960 using same Chrome/same zoom and theme; visually inspect header/title/summary/tag collision, long paths, readable font, all visible modules, actual arrow endpoints, color scheme consistency, no fake content.
2. Browser workflow in an isolated Git repo that contains module and file nodes (and a scoped REVIEW annotation) verifies DOM hierarchy/real labels, no clipping in card bounds, accessible expand/drill/source actions, keyboard and no page overflow.
3. Files with long basename and long source summary don't overflow; path data and tooltip remain inspectable. Detailed mode and module expanded mode render distinct variants. Parent selection/polling stable.
4. Test old 170 plugin behavior, 56 core/MCP, 48 Web and existing 10 Chrome workflows (or more with new node workflow). Strict TS, Prettier, production build and VSIX isolated install checks.
5. An independent read-only review of implemented components flags confirmed UX/geometry/security flaws; address user-affecting issues and rerun. Report explicit limits and real screenshots, not 'pixel perfect' unsupported claim.

## Ownership

Worker (Mac-mini Codex): apps/web/src/graph/GraphView.tsx only GraphNode and optional local helper; apps/web/src/graph/graph.css node card-related overrides; apps/web/src/graph/model.ts node width/height ONLY. Do NOT change graph controls, parent-selection, relation/evidence/impact logic or shared contracts, source scanner, tests, package, docs, output artifacts or user's dirty file. Main owns browser tests, lint/build, visual QA, release and git commit. Any integration concerns report to main.
