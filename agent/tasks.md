# Current Tasks

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
