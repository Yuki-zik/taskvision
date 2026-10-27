# Current Tasks

## 3.7 多项目个人工作台 — 2026-10-27

用户要求在页面直接切换本地工程、查看真实 INTENT 和源码证据、个性化三栏尺寸及停靠位置、VS Code 兼容源码标签/语法高亮、明暗/系统主题。分支 feat/multi-project-personal-workspace-20261027，从 f068b5c 开发；源码权限、Review 和原插件约束保持。新增本机允许列表项目目录（需人工显式添加），HTTP 逐请求按工程注册 ID 读取/写入（无全局当前工程），隔离二个浏览器标签页。偏好保存到用户私有 0700/0600 路径而非 Git，画布节点/视角、导航和检查器左/右/底位置可持久恢复。Shiki 按语言与主题按需加载，继承 TaskVision manifest 标签通道，以及扩展启动时初始工程的有效高亮；浅色默认正文低对比度时自动压暗，保证至少 4.5:1。

独立只读代码审查发现两条真实阻塞：TransferPanel 下载项目 B 时曾误导出默认项目 A，现 URL 精确传注册工程 ID，实际下载 Beta JSON 证实不含 Alpha；浅色默认 CORE/REUSE/INTENT/REVIEW 字色原来不符合可读性要求，新增专项 contrast 检验。两项经独立二次审查判定 PASS。另修复旧 Review 在窄屏被右栏覆盖、Shiki 并发语法加载首次内容不稳定问题。测试 32 Chrome 用户流程、102 Web、64 核心/MCP、170 原插件 QUnit、6 几何布局；8 个多工程/私有设置安全集成测试也通过。

验收见 agent/personal-workspace-acceptance.md。工作证据存 Mac mini 的 agent-machine/workbench/taskvision-projects-layout-20261027；无新图形引擎、无远端 push、无 Marketplace 发布、无默认 2.0.1 替换。原用户更改 .taskvision/ai-status-report.md 只保留在工作树，严禁入库。本版还不支持所有 Toolbar 自由浮动；Web/VS Code 的自定义 ThemeColor 不保证逐像素一致。

## 3.6 Graph Studio — 2026-10-27

User explicitly rejected3.5 screenshot: kinky/braided fans, outdated coarse interface, hidden node facts and insufficient legend. Branch `feat/graph-studio-20261027` from3400916. Main implementation is complete: coherent charcoal workbench; source-backed visible tag/fact/status cards; readable85% default vs explicit whole-mapFit; opt-in minimap; three geometry styles with semantic legend; route-aware near-socket ordering and socket-perimeter anchoring. Existing ReactFlow/ELK/SmartEdge kept, no runtime dependencies added.

Independent read-only review confirmed searchcontrast/filterstate/taskheading/defaulttextsize issues, then minimapoverlap; all addressed, bounded final verdictPASS. Exact MCPfan reproduced/fixed and21siblingnear-port combinations checked. Popupaction/Escape/focus behavior and initialFit verified by meaningful userflows. Final artifact/runtime/Host results remain in local report and workbench.

Acceptance contract `agent/graph-studio-acceptance.md`; evidence root `~/agent-machine/workbench/taskvision-graph-studio-20261027/`. No remote push/Marketplace/default2.0.1 replacement. Preexisting `.taskvision/ai-status-report.md` remains excluded, never restored.

## 3.5 Comfy-style wire separation delivered — 2026-10-26

User reported overlapping links. Branch feat/comfy-wire-lanes-20261026. Implemented stable per-edge ports, smooth cubic cables, distinct obstacle A* waypoints, importer-colored overview, relation kind colors in category mode, and selected-wire focus with sibling fading. Underlying source evidence and older editor/Agent APIs are preserved. No new graph engine or dependency, no remote publication or user-profile replacement.

Actual acceptance is in agent/wire-lane-acceptance.md and private Mac mini workbench taskvision-wire-lanes-20261026. The preexisting .taskvision/ai-status-report.md update is excluded from this change.

## 3.4 official React Flow UI integration delivered — 2026-10-26

User asked to choose a polished mature OSS node design and actually use it. Branch `feat/official-node-kit-20261026`, baseline f9f2c13. Actual BaseNode and NodeTooltip registry source is now vendored and rendered, with raw source/registry SHA256 and MIT notices. Tailwind4 utilities are bounded to the node kit and omit Preflight. Floating UI flip/shift/size/hide safely places unscaled details/actions outside the transformed canvas. Compact shared geometry, less-dense ELK spacing, semantic zoom and opt-in right detail panel preserve source relations and original workflows.

Verified locally: strict TS/Prettier;170 original extension tests;56 Core/HTTP/MCP;58 Web/model/geometry;6 layout-export checks;18 real Chrome flows with zero retries. Isolated3.4 VSIX activation/editor/custom tags/MCP config/service start-stop and package-only11-tool Web/MCP guidance roundtrip verified. Independent read-only review identified viewport clipping, duplicate focus and far-zoom Escape focus loss; all3 were reproduced/addressed and final targeted verdict PASS. Full UI changes do not claim universal platform or whole-project correctness.

Evidence: `agent/official-ui-kit-acceptance.md`, `third_party/react-flow-ui/`, local ignored report and `~/agent-machine/workbench/taskvision-ui-kit-20261026/`. No push/publication or daily2.0.1 replacement. Preexisting `.taskvision/ai-status-report.md` remains outside commit; its running-plugin generated timestamp evolved and was not restored.

## 3.3 architecture node UI delivered — 2026-10-26

User observed Web graph module/file nodes looked crude and asked about mature OSS component implementations. Branch `feat/graph-node-system-20261026`, TaskVision 3.3.0 local preview. Borrowed **React Flow UI first-party MIT Base Node header/content/footer composition**, along with LikeC4's architecture hierarchy, but **did not install a Tailwind/shadcn UI stack or copy paid examples**. Reworked card information hierarchy (real namespace, basename, file count, semantic summary, tags, review/Agent state), two measured module/file variants and source/drill/expand controls. Preserved original ReactFlow/ELK/SmartEdge and actual source-grounded connection semantics.

Real Mac mini visual inspection at 1440×960 revealed initial top clipping and a bottom minimap overlay after increasing node geometry; adjusted Fit inset and minimap, measured 8/8 nodes visible with no overlap. Independent Codex read-only review found another P2: 1280×800 Fit bottom-right retained a 75% minimum and clipped modules. Corrected both TaskVision and React Flow's own Fit to `responsiveFitOptions()`, with real eight-module fixture checking all bounds and minimap exclusion after initial, upper Fit and bottom Fit; subsequent independent review **VERIFIED**. Smaller views may require ~50% zoom to show the whole diagram; use manual zoom or scope drill for reading.

| Acceptance | Actual result |
|---|---|
| Original QUnit extension | 170/170 |
| Core/HTTP/MCP security, review | 56/56 |
| Web graph & knowledge | 48/48 |
| Actual Chrome user flows | 13/13, including 3 new node/card geometry, actions, responsive and eight-module-fit cases |
| ELK/D2 exporter | 6/6 |
| Strict TS and Prettier | Passed |
| VSIX installation and live Extension Host | Isolated 3.3 activated, 8 key commands, old CUSTOM tag preserved, source editor, HTTP launch-stop, MCP config clipboard verified |
| Package-only Web + MCP | Both HTTP200, human guidance roundtrip and 11 tools; no node_modules in install |

Evidence: `agent/node-design-acceptance.md`, `agent/reports/taskvision-3.3-node-design-20261026.md`, Mac mini workbench `~/agent-machine/workbench/taskvision-node-design-20261026/`. No remote publication, default profile change, or touching user's unrelated `.taskvision/ai-status-report.md` modification.

## Review 3.2.1 history/visibility repair — 2026-10-26

User reported Web Review display bug. Reproduced against **actual pending 2.1 review** in Mac mini's TaskVision DB: old head `f012814`, new head `d16b7a4`; 64 historical file hashes, no claim-time baseline, 8 now ignored paths. Existing Web API returned HTTP403 `Ignored files are not exposed`, displayed generic permission error and locked actions. Fixed in `fix/review-legacy-detail-20261026`: missing-baseline history is metadata-only and clearly marked unreviewable, no source substituted, safe source skipped in modern partial reviews. `review_resolve` denies missing baseline, formerly safe paths made ignored, and deleted baseline-only paths; nested scope '' remains valid. Web shows revision provenance, incomplete/blocked evidence and human re-review action without automatically resolving user record.

Independent Codex read-only review twice: first found two concrete P2 mismatches (nested-workspace empty scope; deletion baseline-only path bypassing Web), both reproduced red then repaired green; second review VERIFIED. Verified local suites: 170 QUnit +56 Core/HTTP/MCP +48 Web +10 true Chrome workflows; strict TypeScript/Prettier and 3.2.1 VSIX package + isolated VS Code Extension Host passed. User's unrelated `.taskvision/ai-status-report.md` edit was never changed or staged. Old 2.1 pending record remains pending. No remote push/Marketplace/default-profile replacement. See `agent/reports/taskvision-3.2.1-review-acceptance.md` and `workspace/README.md`.

## Dependency impact lens and ELK/D2 export delivered — 2026-10-26

User-requested continued TaskVision graph improvement on `feat/graph-impact-tala-20261026`. Direct dependency, direct reverse dependents, reverse-transitive possible-impact and neighborhood lenses now run on the existing source-grounded React Flow graph. Actual geometry and zoom persist across lens changes/polls, source relationship evidence stays truthful. Selected modules retain expanded file representatives and keyboard activation synchronizes the parent inspector. Version 3.2.0 local preview, not published/pushed; daily 2.0.1 preserved.

| Verified boundary | Result |
|---|---|
| Legacy, domain/MCP, Web, browser, geometry tool | 170 / 52 / 48 / 6 / 6 passed, strict TS and Prettier passed |
| Independent read-only review | Three P2 bugs found, reproduced and fixed; final targeted review VERIFIED |
| Actual Mac mini built-core/ELK geometry | 161 indexed files; 8 modules; 11 edges; 0 node overlaps / 0 unrelated-node intrusions / 1 proper crossing / 22 bends |
| TALA | Official D2/TALA verified as possible alternative, but no CLI/WASM downloaded; **not executed**, no comparison metric claimed |
| VSIX 3.2 isolated Host and MCP | Extension activated, tags/commands/launch-stop passed; packaged Web and 11 MCP tools work without installed node_modules |

Evidence and limitations: `agent/impact-layout-research.md`, `agent/impact-layout-acceptance.md`, `agent/project.md`, sanitized report `agent/reports/taskvision-3.2-acceptance-20261026.md`; raw logs in ignored local workbench. The preexisting `.taskvision/ai-status-report.md` user edit was not modified or staged. No remote push, Marketplace or default-profile replacement.

## Semantic graph refinement delivered — 2026-10-26

User-requested OSS research and connection/relationship design improvement. Branch `feat/semantic-graph-20261026`, local preview 3.1.0. Reused React Flow + ELK, adopted pinned MIT Smart Edge v5 A* routing, and borrowed LikeC4's merge-versus-classify relationship UX. Code AST now records exact source relation kind, 1-based line, specifier and provenance; click a bundled edge to inspect accurate evidence. Default top-level summary reduced real-module links from 15 category lines to 10 grouped lines with all categories recoverable.

| Acceptance | Current result |
|---|---|
| Source-grounded semantics / SQLite / HTTP / MCP | 52 / 52 tests passed |
| Existing VS Code tasks and highlights | 170 / 170 tests passed |
| Interactive relationships/model, aggregation, layout | 31 / 31 tests passed |
| Actual Chrome browser user flows | 5 / 5 passed; line-level source drill, relation categories, drag-preview update, original knowledge/review workflows |
| Initial layout | 8 / 8 TaskVision modules visible without manual fitting; 10 sampled source-verified SVG paths crossed 0 unrelated node interiors |
| Responsive | 1440, 1280 and 390px widths; no full-page horizontal overflow |
| Independent review | PASS with two P2 findings; both reproduced and repaired (dragging stale route, focus/filter counts), tests re-run |
| VSIX | 3.1 isolated installation; built Web and 11 MCP tools run without node_modules; daily 2.0.1 retained |

Docs: `agent/semantic-graph-oss-review.md`, `agent/semantic-graph-acceptance.md`, `workspace/README.md`; sanitized acceptance report `agent/reports/taskvision-semantic-graph-20261026.md`. Remaining future work: LikeC4 Graph/Diagram split, D2/TALA same-graph A/B and CodeMap reverse-impact overlay. No automatic commits to remote or Marketplace publication. **The preexisting `.taskvision/ai-status-report.md` edit was not staged, modified or reverted by this graph task.**

## TypeScript + UX refactor delivered — 2026-10-26

User-authorized full refactor on Mac mini, branch `refactor/typescript-workbench-20261026`, baseline `f012814`. Version3.0.0 preview. Old VSIX and consistent SQLite backup retained; no remote push/publication or default-profile replacement.

| Area | Verified outcome |
|---|---|
| Typed architecture | All handwritten extension/core/transport/Web source migrated to strict TypeScript; generated JS is not a second source of truth |
| Compatibility | 170 QUnit behavior tests; installed extension activation, editor, old/new commands and custom tags preserved |
| Core and protocol | 47 tests, including canonical nested-root scopes, legacy lease handoff, scope-preserving human adoption, import freshness and scoped review baselines |
| Graph/UI | React Flow+ELK; 13 graph/diff tests; four real-browser workflows pass with no test retries |
| Actual Agent use | Two real Mac-mini Codex threads, two worktrees: context/reuse, human mid-task update, claim conflict, private credential recovery, tests and Review; combined fixture independently passes4 tests |
| Human Review | Actual Codex diff inspected in Web; approval exercised only in isolated acceptance fixture; real project approval remains user-owned |
| Independent review | Four read-only review rounds; reproduced/fixed the eight concrete scope/coordination/knowledge findings, final targeted PASS |
| Packaging | Production VSIX with dependencies bundled; installed Web/MCP works without node_modules; original daily2.0.1 preserved |

Evidence: local `agent/reports/taskvision-3.0-acceptance-20261026.md`, plus `~/agent-machine/workbench/taskvision-refactor-20261026/`. Source guide: `workspace/README.md`. Reviewer and raw agent logs are local/private; export only sanitized summaries. Remaining limits: local/cooperative coordination, static graph coverage, explicit budgets, no remote CI or other-OS graphical Host claim.

## Local preview delivered — 2026-10-25

User authorized rebuilding TaskVision on Mac mini. Local repository: `~/Code/taskvision`; feature branch `feat/knowledge-workspace-20261025`, base `e4c923c`. Preview version 2.1.0. No remote push, Marketplace publication, user-profile extension replacement or global Agent configuration change.

| Work | Owner | State |
|---|---|---|
| Shared source/knowledge core, SQLite coordination, scope leases and review fingerprints | Main | Implemented and tested |
| Local Web service, real MCP/CLI, dedicated Skill and security boundaries | Main | Implemented and tested |
| Project map, source inspector, human guidance editing, task and review views | Main | Browser-verified on desktop and 390px viewport |
| Existing extension compatibility and opt-in workspace commands | Main | 166 QUnit tests passing; production build and VSIX packaging passing |
| Protocol, security and concurrency acceptance | Main | 22 Node tests passing, including real SDK MCP and child-process contention |
| Real installed VS Code Extension Host | Main | Activation, eight command registrations and custom-tag preservation passed in an isolated profile |
| Human product/architecture review | Human | Pending; no actual project review was self-approved |

Parallel worker launch was attempted but Claude authentication, Copilot policy and Codex account/configuration rejected execution before any worker changed code. Main completed implementation directly; the three-worker plan is not a claim of completed independent agent review.

Acceptance evidence is in `agent/reports/taskvision-workspace-acceptance-20261025.md` and `~/agent-machine/workbench/taskvision-20261025/`. Real browser review acceptance was exercised only on an isolated fixture. Source entry tags and the user's stated reuse requirement were added to the actual project as dogfood knowledge.

Known limits: local-first Node22.18+ runtime; advisory source-scope leases; lightweight lexical structure instead of a complete language graph; no cross-device sync, automatic scheduler or Git synchronization of Web notes. Web knowledge and coordination live in the Git-common-dir SQLite database and require explicit export for portability. General symbol/move anchor migration is incomplete. Existing MIT declaration lacks a LICENSE file, and VSIX packaging reports that warning; provenance/license release work remains before publication.

Next validation priorities: user walkthrough of the UI, realistic parallel coding with supported Agent clients, large-repo incremental performance, symbol-level navigation/anchor migration, durable knowledge import/export and non-macOS Extension Host acceptance.

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## Session Summary (2026-07-31)

- Active focus: Read-only audit of the whole codebase, cleanup of merged local branches, and syncing the local checkout to `origin/master`. No runtime code changed.
- Branch cleanup: deleted 9 fully-merged local branches (`integration-preview`, `work-5`–`work-8`, and four `yuki-zik-*` feature branches) after cross-checking each with `merge-base --is-ancestor`, two-dot diff, `git log --cherry-mark` and `gh pr list`. Retained the two branches held by Copilot worktrees. Remote refs untouched.
- Sync: local `master` was 0 ahead / 7 behind; fast-forwarded `2cb179e` → `4f2e592`. Nothing was ever pending upload.
- Verification: `npm install`, `npm test` (159 passing, 0 failed; the pre-sync baseline was 119).
- **Caveat**: the first pass of this audit ran against the stale local `master`, which produced two false findings (duplicate `getRulerLane` export; ~22 root-level debug files) — both were already fixed upstream. Findings below were re-verified against `4f2e592`.

### Confirmed defects still open on `master` (not yet scheduled)

| Area | Evidence | Note |
| ---- | -------- | ---- |
| Localisation | `package.json:675`, `:680`, `:1585` | `setScheme` / `customizeAppearance` titles and the `showStatusPrefix` description are hard-coded English, so they bypass the otherwise complete NLS key parity. |
| Sidecar concurrency | `src/taskMetaStore.js:11`, `:140`, `:155` | The in-memory store cache has no mtime check, so edits an external agent makes to `.taskvision/tasks-meta.json` are silently overwritten on the next save. This undercuts the external-agent handoff the feature exists for. |
| Highlight opacity | `src/schemes.js:31-37` | `normalizeOpacity` does not clamp values above 100, so an opacity of 200 yields an invalid `rgba(r,g,b,2)`. |
| Repo hygiene | `.gitignore` lists `.taskvision/`, yet `git ls-files .taskvision` still returns 4 files | `.gitignore` does not untrack files that are already tracked, so the rule has no effect and the generated artifacts keep producing diffs. |

## Active Session Task

| Priority | Task                                                     | Status    | Owner | Due        |
| -------- | -------------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Full codebase read-through and defect re-verification    | Completed | AI    | 2026-07-31 |
| P2       | Clean up merged local branches and sync to `origin/master` | Completed | AI    | 2026-07-31 |
| P2       | Decide whether to untrack the generated `.taskvision/` artifacts | Pending | Human | TBD |

## 升级调研 Session (2026-06-16)

- 产出:`agent/reports/taskvision-upgrade-research-2026-06-16.md` —— 跨模型 deep-research 升级 roadmap(websearch+gh+codex search 三通道核实 + `mcp__codex__codex` 对抗 REVISE→reconcile;**未改任何源码/构建**)
- 核心结论:差异化护城河 = 代码锚定扫描 + 状态机 + context refs + change-session;**P0** = `LanguageModelTool`(VS Code/Copilot)或 MCP(跨客户端)双 agent surface + 只读共享核心 + 安全护栏(prompt-injection 防护)+ 类型化窄适配层
- 后续可落地任务(尚未排期,待人决策):P0 地基四件套 → P1 context-pack 富化 / agentability 确定性标签 / Webpack4→esbuild

## Session Summary

- Active focus: Implemented issue #2 — added a command to uniformly set the highlight scheme for all tags, resolving that shipped per-tag `customHighlight` entries hid `defaultHighlight`.
- Verification: `npx qunit test/highlightScheme.tests.js` (5 passing), `npm test` (126 passing), `npm run webpack`, `git --no-pager diff --check` (clean).

## Active Session Task

| Priority | Task                                             | Status    | Owner | Due        |
| -------- | ------------------------------------------------ | --------- | ----- | ---------- |
| P1       | Add "set highlight scheme for all tags" command  | Completed | AI    | 2026-07-08 |
- Active focus: Fixed issue #1 — Cursor rendered a solid gray background block behind the `neon+glass` tag highlight where VS Code showed the intended translucent glass box.
- Root cause: `buildGlassDecorationOptions` in `src/highlights.js` placed `borderRadius` on the decoration base rule while `backgroundColor`/`border` lived only in `light`/`dark`; a border/borderRadius base rule without a co-located background triggers Cursor's fallback gray fill (microsoft/vscode#175819, wayou/vscode-todo-highlight#434).
- Fix: re-scoped `borderRadius` into `light`/`dark` alongside the border and injected `backgroundColor: 'transparent'` on any themed object that carries a border/borderRadius without an explicit background; VS Code appearance unchanged.
- Verification: `npx qunit test/highlights.decorations.tests.js` (5 passing), `npm test` (124 passing), `npm run webpack` (success). Cursor is not installed in this environment, so final visual confirmation in Cursor requires a maintainer.

## Active Session Task

| Priority | Task                                                        | Status    | Owner | Due        |
| -------- | ---------------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Fix Cursor gray highlight background block (issue #1)       | Completed | AI    | 2026-07-08 |
- Active focus: Fixed GitHub issue #4 — `ripgrep.search` now returns the partial results it collected (with a one-time warning) instead of rejecting the whole search when stdout exceeds `maxBuffer`, and raised the default `taskvision.ripgrep.ripgrepMaxBuffer` from 200 KB to 20480 KB (20 MB).
- Verification: `npm test` (120 passing, including a new truncation/partial-results regression test and the unchanged SIGINT interrupted test) and `npm run webpack` (build succeeded).

## Active Session Task

| Priority | Task                                                              | Status    | Owner | Due        |
| -------- | ----------------------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Fix issue #4: return partial ripgrep results instead of failing   | Completed | AI    | 2026-07-08 |
- Active focus: Fixed GitHub issue #3 — added the `%` comment prefix (LaTeX/Matlab/Erlang) to the default TODO/FIXME detection regex so `% TODO`/`% FIXME` are detected.
- Verification: `npm ci`, `npm test` (120 passing, 0 failing, including the new `%`-comment case), `npm run webpack` (build succeeded).

## Active Session Task

| Priority | Task                                                | Status    | Owner | Due        |
| -------- | --------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Support `%`-style comment TODO detection (issue #3) | Completed | AI    | 2026-07-08 |
- Active focus: Fixed the Windows-only `master` CI failure (`extension applies on-demand stable ID tracking policy`) caused by CRLF checkouts breaking `\n`-based multi-line source-scanning assertions.
- Root cause + fix: no repo `.gitattributes` + `core.autocrlf=true` ⇒ CRLF working tree; added `.gitattributes` (`* text=auto eol=lf`) to force LF checkout everywhere, and a `readSource()` EOL-normalizing helper in `test/extension.tests.js` for robustness against existing CRLF copies. No runtime code changed.
- Verification: isolated worktree off `origin/master` on Windows (CRLF working tree) reproduced the failure, then `node qunit test/extension.tests.js` (15 passing), `npm test` (145 passing), and `npm run webpack` all passed; `git check-attr` confirms `eol=lf`; staged diff is only `.gitattributes` + `test/extension.tests.js`.

## Active Session Task

| Priority | Task                                     | Status    | Owner | Due        |
| -------- | ---------------------------------------- | --------- | ----- | ---------- |
| P1       | Fix Windows CRLF `master` CI test failure | Completed | AI    | 2026-07-08 |
