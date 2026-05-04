---
name: taskvision-annotations
description: Use when writing or editing TODO/NOTE-style source comments in a TaskVision-managed repository. Teaches the tag vocabulary, inline status tokens, `tv:` directives, and the task/context/review annotation classes so agents stay compatible with the TaskVision tree, sidecar stores, and AI context exports. DO NOT USE for editing `.taskvision/*.json` directly — those files are owned by the extension.
---

# TaskVision Annotation Convention

TaskVision parses source comments into a task tree and a structured AI handoff bundle. Every annotation an agent writes must be parseable by the extension, otherwise it is invisible to humans, sidecars, and downstream agents.

## When to use

- Adding a new task, follow-up, blocker, or idea in source.
- Recording a constraint / invariant / decision next to the code it governs.
- Leaving a review / verify / risk note tied to an active agent session.
- Updating an existing TaskVision annotation's status or directives.

Do **not** use this skill to edit `.taskvision/tasks-meta.json`, `.taskvision/context-index.json`, or `.taskvision/change-sessions/*.json`. Those are written by TaskVision commands.

## Annotation grammar

Every annotation is a single comment line with this token order:

```
<COMMENT-PREFIX> <TAG> [<status>] [tv:id=...] [tv:ctx=...|tv:review=...] [tv:task=...] [tv:session=...] <body text>
```

Rules:

- `<COMMENT-PREFIX>` is the language's normal single-line comment marker (`//`, `#`, `<!--`, `--`, `;`, ...).
- `<TAG>` MUST be one of: `TODO`, `FIXME`, `XXX`, `NOTE`, `IDEA`, `[ ]`, `[x]`. Use `TODO`/`FIXME` for work, `NOTE`/`IDEA` for context or review notes, `[ ]`/`[x]` for markdown checkboxes.
- `[<status>]` is REQUIRED for tasks and SHOULD be present for context/review notes. Allowed values: `todo`, `doing`, `blocked`, `paused`, `review`, `done`, `wontdo`, `idea`.
- `tv:` directives are optional but, when present, MUST keep the order `id` → `ctx`/`review` → `task` → `session`.
- `<body text>` is the human-readable summary. Keep it on the same line.

## The three annotation classes

| Class | Required tag(s) | Required directives | Example |
| :--- | :--- | :--- | :--- |
| `task` | `TODO`, `FIXME`, `XXX`, `[ ]`, `[x]` | `[tv:id=task....]` (recommended) | `// TODO [doing] [tv:id=task.cache.123abc] refactor cache invalidation` |
| `context` | `NOTE` (or `IDEA`) with `[idea]` | `[tv:id=ctx....]` and `[tv:ctx=<kind>]` | `// NOTE [idea] [tv:id=ctx.cache.456def] [tv:ctx=invariant] cache writes must stay synchronous` |
| `review` | `NOTE` with `[review]` | `[tv:session=...]` and `[tv:review=<kind>]` | `// NOTE [review] [tv:session=sess.20260308.codex.001] [tv:task=task.cache.123abc] [tv:review=verify] verify retry path under timeout` |

`tv:ctx` allowed kinds: `must-read`, `constraint`, `invariant`, `business-rule`, `pitfall`, `do-not-touch`, `entrypoint`, `example`, `decision`, `terminology`.

`tv:review` allowed kinds: `changed`, `why`, `risk`, `verify`, `blocked`, `followup`.

## Stable IDs

- Stable IDs look like `task.<slug>.<6-hex>` or `ctx.<slug>.<6-hex>`.
- If you are creating a new task or context anchor and you do not have an ID, **omit `tv:id`**. Run the `TaskVision: Sync Data Model` command (or have the user run it) to let TaskVision compute and write it back.
- Never invent an ID with random hex. Never reuse another annotation's stable ID.
- When updating an existing annotation, preserve its `tv:id` exactly.

## Status semantics (only what an agent must respect)

- Use `review` instead of `done` whenever code changed but verification is incomplete.
- Do not flip `blocked`, `paused`, or `wontdo` to an active state without saying why in the body or in a `review` annotation.
- For markdown checkboxes the implicit status is: `[ ]` → `todo`, `[x]` → `done`. Adding an explicit `[status]` overrides the implicit value.
- Plain `TODO` without a status is treated as `todo`. Always write the status explicitly to make changes auditable.

## Choosing between context and review

- Use `context` when the note is a long-lived fact about the code (constraint, invariant, decision, pitfall). It belongs next to the code forever.
- Use `review` when the note is scoped to an in-progress session (`verify this`, `why this changed`, `risk to watch`, `followup`). It expires when the session closes.
- A `review` annotation MUST carry `tv:session=...`. Ask the user (or call `TaskVision: Start Agent Session`) to obtain a session ID before writing review notes.

## Self-check before writing

1. Does the line start with the file's normal comment marker?
2. Is the tag one of the allowed values?
3. Is the status one of the allowed values, or correctly omitted (only for plain `[ ]`/`[x]`)?
4. Are `tv:` tokens in the order `id, ctx|review, task, session`?
5. Is the body text a single line, no trailing block-comment terminator?
6. Did you avoid touching any `.taskvision/*.json` file?

If all six pass, the annotation will round-trip cleanly through the TaskVision tree and the AI context export.

## Examples

```ts
// TODO [todo] add streaming support to the parser
// FIXME [blocked] [tv:id=task.parser-stream.aa12cd] waiting on upstream codec PR
// TODO [review] [tv:id=task.cache.123abc] retry path rewritten, needs QA
// NOTE [idea] [tv:id=ctx.cache.456def] [tv:ctx=invariant] cache writes must stay single-flight
// NOTE [review] [tv:session=sess.20260308.codex.001] [tv:task=task.cache.123abc] [tv:review=risk] cold-start race possible if invalidation lands before warmup
- [ ] [tv:id=task.docs.update.7e44a1] update README quick start
- [x] migrate jest config
```

## Hand-off contract

After writing or editing TaskVision annotations:

- Tell the user (or the next agent) which stable IDs you touched and why.
- Suggest running `TaskVision: Sync Data Model` if you added new annotations without `tv:id`, or `TaskVision: Export AI Context` if downstream agents need the refreshed bundle.
- Do not modify sidecar JSON or generated `ai-context.{md,json}` files yourself.
