# Current Tasks

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P1 | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P2 | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change | ⏳ In Progress | AI + Human | Ongoing |
| P2 | Review whether a lint command should be added to complement the existing QUnit suite | ⏳ Pending | Human | TBD |

## Session Summary

- Active focus: 已修复 CI 中 `npm test` 的失败；`utils.extractTag` 现在在 regex 不含 `$TAGS` 且正则未命中时会回退到字面量匹配，兼容旧测试与旧配置。
- Verification: `npm test`，`npm run webpack`，`git diff --check -- src/utils.js agent/tasks.md agent/timeline.md`

## Active Session Task

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | 修复 CI 中 `utils.extractTag` 的全量测试失败，恢复 `npm test` 通过 | ✅ Completed | AI | 2026-03-12 |
