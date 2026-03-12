# Current Tasks

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P1 | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P2 | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change | ⏳ In Progress | AI + Human | Ongoing |
| P2 | Review whether a lint command should be added to complement the existing QUnit suite | ⏳ Pending | Human | TBD |

## Session Summary

- Active focus: 已完成多通道高亮亮度拆分，为文字、辉光、玻璃背景和玻璃边框提供独立透明度控制，并保留旧 `opacity` 作为 `glassOpacity` 兼容别名。
- Verification: `npx qunit test/schemes.tests.js test/highlights.tests.js test/styleComposer.tests.js`，`npm run webpack`

## Active Session Task

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | 梳理高亮组件的视觉职责，并实现按背景、辉光、文字分离亮度控制的最小方案 | ✅ Completed | AI | 2026-03-12 |
