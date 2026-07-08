# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## Session Summary

- Active focus: Fixed GitHub issue #3 — added the `%` comment prefix (LaTeX/Matlab/Erlang) to the default TODO/FIXME detection regex so `% TODO`/`% FIXME` are detected.
- Verification: `npm ci`, `npm test` (120 passing, 0 failing, including the new `%`-comment case), `npm run webpack` (build succeeded).

## Active Session Task

| Priority | Task                                                | Status    | Owner | Due        |
| -------- | --------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Support `%`-style comment TODO detection (issue #3) | Completed | AI    | 2026-07-08 |
