# Current Tasks

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P1 | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P2 | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change | ⏳ In Progress | AI + Human | Ongoing |
| P2 | Review whether a lint command should be added to complement the existing QUnit suite | ⏳ Pending | Human | TBD |

## Session Summary

- Active focus: 已定位并修正“本地绿、GitHub Windows 红”的差异；问题来自模拟 `win32` 的测试在真实 Windows runner 上仍强行 monkeypatch `process.platform`。
- Verification: `npm test`，`npm run webpack`，`git diff --check -- test/tests.js agent/tasks.md agent/timeline.md`

## Active Session Task

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | 解决最新提交在 GitHub Actions Windows runner 上仍失败的问题 | ✅ Completed | AI | 2026-03-14 |
