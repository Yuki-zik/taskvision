# TaskVision 3.7: multi-project + personal layout + VS Code-like source rendering + theme

User-authorized targeted product work on Mac mini. Baseline 3.6 f068b5c, branch feat/multi-project-personal-workspace-20261027. Explicit requests:
- Navigate between local projects inside Web, inspect actual indexed intent/CORE/REUSE/REVIEW and source relations without mixing workspaces.
- Personally resize and rearrange left navigation and inspector, persist positions and widths across reload/port changes; allow returning defaults.
- Right inspector code rendering should follow VSCode syntax colors and TaskVision's actual highlight-channel defaults/customs (not just regex-highlighted tag words).
- Real light/dark/system theme with persistence, accessible contrast and consistent Graph Studio, inspector/tasks/review.
Preserve all original VSCode highlight/task UX, agent MCP/CLI, source evidence, safety, reviews, current local project and user-owned .taskvision/ai-status-report.md (do NOT stage/revert/overwrite). No remote push or Marketplace/default user profile replacement.

## Source architecture / API contract
Server supports explicitly registered local project roots only; initial root included. Registration requires same-origin token POST with a visible UI confirmation of the exact absolute path, canonicalizes directory, refuses home/filesystem root and non-project dirs, stores approved paths as 0600 per-user state (0700 parent) separate from the repository. Do not scan all of ~/Code or accept path from unauthenticated URL. Project id is stable SHA256(realpath) truncation; API GET /api/projects, POST /api/projects/register, and GET/POST /api/preferences. Existing snapshot/bootstrap/source/reviews/operation endpoints honor a registered ?project=id; omitted query retains initial root for backward compatibility. Different browser sessions' selections must not mutate a global active workspace. Cache/open workspaces in map, close all on server shutdown; errors for removed/offline workspaces are explicit. Preference schema bounded/validated; stored separately per-workspace per-user with atomic restricted writes. ServerOptions.preferencesDir isolates tests.
Frontend useWorkspace reinitializes token/snapshot/load if project id changes, cancels outstanding reads; every source/review/mutation uses same selected project id. On switch, reset transient selections, editor, query, scope and prevent incomplete edits from silent loss (explicit confirm). Multiple browser tabs selecting distinct projects must stay independent.

## Personalization contract
Left sidebar 160-340px, collapsible; inspector dock right/left/bottom, resizable in each orientation (right/left width 290-740px, bottom height 220-65vh) and hide/reopen. All controls have keyboard equivalents and visible separators/handles. Widths/position/pan zoom preferences restore across reload and ephemeral localhost port, scoped by canonical project ID; Restore layout resets. Do not alter repository Git-tracked source with prefs.
Theme dark, light, system, with effective OS match on prefers-color-scheme, persisted per user. Light is genuinely usable for whole app and graph, not CSS filter inversion. No remote fonts, new graph engine or background network needed.
Graph canvas positions/viewport persist to per-user project prefs with strict size bound; switching project never carries graph coordinates from prior project. Defaults still fit and labels readable.

## VS Code parity
Web's source inspector shows real code grammar syntax colors (TextMate/VSCode-compatible engine preferred; lazy language/theme assets), line-number/gutter, read-only selection, and TaskVision tag decoration using the exact default taskvision.highlights.customHighlight and defaultHighlight rules from package.json, merged with effective VSCode user overrides passed read-only by extension service bridge. Interpret foreground/background, font weight/style and neon/glass scopes where feasible, respecting light/dark theme. DO NOT claim pixel-exact rendering: Web is not the VSCode editor host and custom ThemeColor/workbench theme values cannot always be resolved exactly. Expose truthful fallback/which style source loaded in UI. AST/source tags must not be invented. No raw HTML injection from source.

## Ownership (two real local Codex implementers plus main)
Server: apps/server/src/server.ts, new apps/server/src/projectRegistry.ts/userPreferences.ts, workspace/test/project-switch.test.mjs and workspace/test/user-preferences.test.mjs, server-only docs notes. No React App, no CSS, no VSCode extension bridge.
Source inspector: apps/web/src/components/Inspector.tsx, new apps/web/src/components/CodeSource.tsx, new apps/web/src/services/sourceHighlight.ts, new apps/web/src/code-source.css, new apps/web/test/source-highlight.test.ts; no main App, server or theme global CSS. Assume main installs Shiki and supplies useWorkspace project-aware API methods. Inspector must get project ID from snapshot, and source view receives theme/highlight settings optionally. Fallback to package default source styles via safe bundler import.
Theme: apps/web/src/studio-theme.css (scope dark instead of global), new apps/web/src/studio-light.css and apps/web/src/tokens.css if necessary; no React, server, package, graph. Main wires theme attr on HTML, appearance controls, resizable dock CSS in new apps/web/src/personal-layout.css.
Main: apps/web/src/App.tsx, hooks/useWorkspace, services/api, src/knowledgeWorkspace.ts, graph persistence, import wiring, tests for browser/EHost, manifests/deps/docs/version/commit/packaging.

## Real user-flow acceptance
- On real Mac mini registered TaskVision and independent repo, select project in Web, verify different root/head/source graph and actual INTENT without leaking task/selection; two browser contexts stay isolated; registering invalid/home/traversal fails, GET cannot register.
- Resize 3 pane dimensions and move inspector right to bottom to left; refresh, change localhost port/server instance; restore exact preference in same project, different project starts its own preferences. Full keyboard and mouse controls.
- Light, dark and system all render content legibly; after reload project-switch remains consistent; no dark-on-dark source, no contrast failures, no theme flash.
- Syntax comments/strings/numbers/keywords and CORE/REUSE/INTENT/REVIEW decoration recognizable and sourced from same plugin default/user config; user code rendered as text, never executed.
- Existing 170 legacy,56 core,91 Web and 26 browser scenarios pass, plus purposeful new browser tests and real installed VSIX Host, packaged Web/MCP. No gratuitous tests, no weakened security or deleted assertions.

## 3.7 验收收尾与独立代码审查

独立审查确认两个实际阻塞并促成修复：初版 TransferPanel 中导出 JSON 没有当前工程 ID，切换到项目 B 却会下载项目 A 的档案。修复后 URL 严格传递当前注册 ID，实际浏览器下载并解析 Beta JSON，确认只含 Beta 的真实标签，绝不混入 Alpha。第二项是 VS Code 的 CORE、REUSE、INTENT、REVIEW 默认颜色在白色 TextMate 编辑器的文字对比度只有 2.54／1.92／2.72／1.67:1；浅色正文自适应变暗至至少 4.5:1，深色配色保持原样，专项单元测试覆盖。

其他真实 Chrome 验收包含：项目 A/B 独立浏览器标签页、服务和本地端口变化后的个人设置恢复、鼠标底部详情拖动、键盘左侧详情宽度更改、跟随操作系统色彩模式、手动移动图节点位置与相机恢复，切换项目后另一个工程不继承旧位置。源码以真实 TextMate token 和 TaskVision 标签范围着色，恶意 HTML 字符串仍仅作为文本。旧 Review 页面窄屏下曾被详情覆盖，移动端现优先展示主 Review／任务／知识界面，需要时再展开详情；旧 Review 权限和历史证据未放宽。

所有测试仅代表 Mac mini + Chrome + 隔离 VS Code 宿主，未覆盖所有操作系统或长期高并发。Shiki 语法包按语言与主题加载，一些大语言的按需分包仍较大；原 ELK 构建大小提示也保留。个人布局不等于任何 UI 模块都能自由浮动，目前为导航和详情停靠、尺寸、图节点坐标和相机。

用户原有的 .taskvision/ai-status-report.md 改动与本轮无关，不在提交范围。没有推送 GitHub、发布 Marketplace 或替换默认的 VS Code 插件。
