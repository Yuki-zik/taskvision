# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## Session Summary

- Active focus: Implemented issue #2 — added a command to uniformly set the highlight scheme for all tags, resolving that shipped per-tag `customHighlight` entries hid `defaultHighlight`.
- Verification: `npx qunit test/highlightScheme.tests.js` (5 passing), `npm test` (126 passing), `npm run webpack`, `git --no-pager diff --check` (clean).

## Active Session Task

| Priority | Task                                             | Status    | Owner | Due        |
| -------- | ------------------------------------------------ | --------- | ----- | ---------- |
| P1       | Add "set highlight scheme for all tags" command  | Completed | AI    | 2026-07-08 |
