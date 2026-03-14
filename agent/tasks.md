# Current Tasks

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P1 | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P2 | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change | ⏳ In Progress | AI + Human | Ongoing |
| P2 | Review whether a lint command should be added to complement the existing QUnit suite | ⏳ Pending | Human | TBD |

## Session Summary

- Active focus: 已补上另一处 Windows 专属测试断言问题；`aiContext` 测试不再用 `path.join()` 比较被实现标准化为 `/` 的相对路径。
- Verification: `npm test`，`npm run webpack`，`rg -n "assert\\.(equal|strictEqual).*path\\.join\\(|path\\.join\\(.*assert" test -S`，`git diff --check -- test/aiContext.tests.js test/tests.js agent/tasks.md agent/timeline.md`

## Active Session Task

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | 解决 GitHub Actions Windows runner 上剩余的跨平台断言失败问题 | ✅ Completed | AI | 2026-03-14 |
