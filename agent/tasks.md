# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## Session Summary

- Active focus: Fixed issue #1 — Cursor rendered a solid gray background block behind the `neon+glass` tag highlight where VS Code showed the intended translucent glass box.
- Root cause: `buildGlassDecorationOptions` in `src/highlights.js` placed `borderRadius` on the decoration base rule while `backgroundColor`/`border` lived only in `light`/`dark`; a border/borderRadius base rule without a co-located background triggers Cursor's fallback gray fill (microsoft/vscode#175819, wayou/vscode-todo-highlight#434).
- Fix: re-scoped `borderRadius` into `light`/`dark` alongside the border and injected `backgroundColor: 'transparent'` on any themed object that carries a border/borderRadius without an explicit background; VS Code appearance unchanged.
- Verification: `npx qunit test/highlights.decorations.tests.js` (5 passing), `npm test` (124 passing), `npm run webpack` (success). Cursor is not installed in this environment, so final visual confirmation in Cursor requires a maintainer.

## Active Session Task

| Priority | Task                                                        | Status    | Owner | Due        |
| -------- | ---------------------------------------------------------- | --------- | ----- | ---------- |
| P1       | Fix Cursor gray highlight background block (issue #1)       | Completed | AI    | 2026-07-08 |
