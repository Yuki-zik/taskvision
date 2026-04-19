# Repository Agent Instructions

This repository uses `agent/` as the governance source for project state, audit history, and AI working rules.

## Required Session Workflow

1. Start every session with a context-efficient read:
   - `agent/tasks.md`: active task + next step only
   - `agent/timeline.md`: newest 3-5 entries only (top of file)
   - `agent/project.md`: read on demand only when constraints/architecture are unclear
2. Summarize the current state before making changes.
3. Update `agent/tasks.md` for the active task.
4. If the work is architectural, broad, or changes public behavior significantly, stop and wait for explicit human approval.
5. Make the smallest necessary change.
6. Run the narrowest relevant verification command.
7. End the session by updating:
   - `agent/tasks.md`
   - `agent/timeline.md`

## Source Of Truth

- Project overview and architecture: `agent/project.md`
- Current tasks and status: `agent/tasks.md`
- Audit trail: `agent/timeline.md`
- Detailed AI operating guide: root `AGENTS.md` (single source of truth)

Use a sliding-window policy by default: do not load full `agent/` history unless the newest window is insufficient for a safe decision.

## Parallel Subagent Policy

- Parallelize independent work by default: exploration, docs lookup, test triage, and disjoint code slices.
- Assign explicit ownership per subagent; avoid overlapping write sets.
- Keep critical-path convergence in the main agent.
- Choose subagent reasoning effort by complexity:
  - `low`: retrieval, summarization, straightforward checks
  - `medium`: routine implementation with clear acceptance criteria
  - `high`: cross-module fixes, tricky regressions, ambiguous failures
  - `xhigh`: architecture/security decisions with high uncertainty (default)
- Start with the lowest viable effort and escalate only when evidence quality is insufficient.

`agent/agents.md` is deprecated. If any historical note conflicts, align behavior to root `AGENTS.md`.

## Always

- Keep all material changes traceable in `agent/timeline.md`.
- Include the implementation motive in every timeline row.
- Keep `agent/project.md` aligned with the real codebase and tooling.
- Prefer tests before implementation when behavior changes.
- State exactly what verification ran.
- Use Conventional Commits for proposed commit messages.
- Preserve human-in-the-loop for major decisions.

## Ask

- Ask before architecture changes, cross-module refactors, storage format changes, or dependency changes.
- Ask before removing tests or changing build and release workflows.
- Ask before destructive or ambiguous edits.

## Never

- Never skip `agent/` updates at session start or end.
- Never make undocumented changes.
- Never claim verification you did not run.
- Never overwrite user changes without explicit instruction.
- Never refactor unrelated code for style only.

## Standard Commands

```bash
npm test
npm run webpack
npm run webpack-dev
git status --short
rg --files
rg -n "pattern" src test
```

## Commit Format

```text
type(scope): summary
```

Example:

```text
docs(agent): sync root instructions with governance docs
```
