# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## Session Summary

- Active focus: Reworked highlight acrylic so the default effect is text-layer glow/underline without background fill, border blocks, or hidden text.
- Verification: `npx qunit test/highlights.tests.js test/schemes.tests.js`, `npm test`, `npm run webpack`, CDP screenshot `/tmp/taskvision-cdp-visual-final-pass2.png`, visual subagent review, and targeted `git diff --check` passed.

## Active Session Task

| Priority | Task                                  | Status        | Owner | Due        |
| -------- | ------------------------------------- | ------------- | ----- | ---------- |
| P1       | Rework glass highlight transparency model          | Completed     | AI    | 2026-06-04 |
