# AI Agent Guide

## Purpose

This file defines how AI agents should operate in this repository so that work remains traceable, testable, and reviewable.

## Operating Model

- One session must begin by checking `agent/project.md`, `agent/tasks.md`, and `agent/timeline.md`.
- One session must end by updating `agent/tasks.md` and prepending a new audit row to `agent/timeline.md`.
- Every material change must be tied to a task entry and a timeline row.
- Prefer minimal, reversible changes with explicit verification.

## Always

- Read current project state from `agent/tasks.md` and `agent/timeline.md` before changing code.
- Keep `agent/project.md` aligned with actual architecture, tooling, and test status.
- Write or update tests before implementation when behavior changes.
- Run the narrowest relevant verification command before finishing.
- Use Conventional Commits when proposing a commit message.
- Record the modification motive in `agent/timeline.md` for every session.
- Flag documentation drift immediately and either fix it or record why it was deferred.
- Keep human approval in the loop for architecture changes, cross-module refactors, schema changes, and destructive operations.

## Ask

- Ask before changing architecture, public workflows, storage formats, or command semantics.
- Ask before adding dependencies, changing build tooling, or removing tests.
- Ask before broad refactors that touch unrelated modules.
- Ask before editing generated assets if the source-of-truth is unclear.

## Never

- Never skip `agent/` updates at session start or session end.
- Never make untracked code changes without adding a timeline entry.
- Never claim verification without running the command.
- Never rewrite unrelated files for style only.
- Never bypass tests after changing behavior.
- Never overwrite user-authored changes without explicit instruction.

## Commands

### Core

```bash
npm test
npm run webpack
npm run webpack-dev
```

### Recommended Inspection

```bash
rg --files
rg -n "pattern" src test
git status --short
```

## Change Workflow

1. Read `agent/tasks.md` and `agent/timeline.md`.
2. Summarize current state and update `agent/tasks.md` with the active task.
3. If the change is architectural or broad, stop and wait for explicit approval.
4. Add or update tests first when behavior changes.
5. Implement the smallest viable change.
6. Run verification.
7. Update `agent/timeline.md` with files, logic, motive, and result.
8. Mark task status in `agent/tasks.md`.
9. Propose a Conventional Commit message.

## Code Style Example

```js
function normalizeStatusToken(token) {
    if (!token) {
        return "todo";
    }

    return String(token).trim().toLowerCase();
}
```

Rules reflected by the example:

- prefer small single-purpose functions
- keep branching shallow
- use explicit defaults
- preserve existing CommonJS style unless a wider migration is approved

## Testing Requirement

- Behavior change: add or update tests in `test/*.tests.js`.
- Documentation-only change: run at least the existing unit suite when practical.
- If verification is partial, state exactly what ran and what did not.

## Commit Message Template

```text
type(scope): summary
```

Examples:

- `docs(agent): add project governance and audit trail docs`
- `fix(highlights): preserve channel-specific style composition`
- `test(task-state): cover generated output exclusion`
