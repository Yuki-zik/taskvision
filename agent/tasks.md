# Current Tasks

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P1 | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P2 | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change | ⏳ In Progress | AI + Human | Ongoing |
| P2 | Review whether a lint command should be added to complement the existing QUnit suite | ⏳ Pending | Human | TBD |

## Session Summary

- Active focus: 已修复剩余的 Windows 专属 CI 失败；`createFolderGlob` 改为基于 `path.win32.relative` 处理根路径场景，并新增模拟 `win32` 的跨平台回归测试。
- Verification: `npm test`，`npm run webpack`，`git diff --check -- src/utils.js test/tests.js agent/tasks.md agent/timeline.md`

## Active Session Task

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | 修复 CI 中剩余的 Windows 专属测试失败，恢复三平台 `npm test` 一致性 | ✅ Completed | AI | 2026-03-12 |
