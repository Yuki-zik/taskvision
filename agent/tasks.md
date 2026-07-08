# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## Session Summary

- Active focus: Fixed GitHub issue #4 — `ripgrep.search` now returns the partial results it collected (with a one-time warning) instead of rejecting the whole search when stdout exceeds `maxBuffer`, and raised the default `taskvision.ripgrep.ripgrepMaxBuffer` from 200 KB to 20480 KB (20 MB).
- Verification: `npm test` (120 passing, including a new truncation/partial-results regression test and the unchanged SIGINT interrupted test) and `npm run webpack` (build succeeded).

## Active Session Task

| Priority | Task                                                              | Status    | Owner | Due        |
| -------- | ----------------------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Fix issue #4: return partial ripgrep results instead of failing   | Completed | AI    | 2026-07-08 |
