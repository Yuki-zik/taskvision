# Current Tasks

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P1 | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed | AI | 2026-03-08 |
| P2 | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change | ⏳ In Progress | AI + Human | Ongoing |
| P2 | Review whether a lint command should be added to complement the existing QUnit suite | ⏳ Pending | Human | TBD |

## Session Summary

- Active focus: Fix the failing aiContext export test by normalising path separators during context-anchor matching in `src/aiContext.js`.
- Verification: `npx.cmd qunit test/aiContext.tests.js`, `npm test`, `npm.cmd run webpack`.

## Active Session Task

| Priority | Task | Status | Owner | Due |
| --- | --- | --- | --- | --- |
| P1 | Fix failing aiContext CI test (`npm test`) | Completed | AI | 2026-03-14 |
