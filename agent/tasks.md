# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## 升级调研 Session (2026-06-16)

- 产出:`agent/reports/taskvision-upgrade-research-2026-06-16.md` —— 跨模型 deep-research 升级 roadmap(websearch+gh+codex search 三通道核实 + `mcp__codex__codex` 对抗 REVISE→reconcile;**未改任何源码/构建**)
- 核心结论:差异化护城河 = 代码锚定扫描 + 状态机 + context refs + change-session;**P0** = `LanguageModelTool`(VS Code/Copilot)或 MCP(跨客户端)双 agent surface + 只读共享核心 + 安全护栏(prompt-injection 防护)+ 类型化窄适配层
- 后续可落地任务(尚未排期,待人决策):P0 地基四件套 → P1 context-pack 富化 / agentability 确定性标签 / Webpack4→esbuild

## Session Summary

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
