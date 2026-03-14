<p align="center">
  <img src="resources/readme-header.svg" alt="TaskVision" width="100%" />
</p>

<p align="center">
  <a href="README_zh.md"><kbd>&nbsp; 中文文档 &nbsp;</kbd></a>&ensp;|&ensp;<kbd>&nbsp; English &nbsp;</kbd>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/license-MIT-7BC96F?style=flat-square" alt="MIT License" /></a>&nbsp;
  <a href="#"><img src="https://img.shields.io/badge/version-2.0.1-3B82F6?style=flat-square" alt="Version 2.0.1" /></a>&nbsp;
  <a href="#"><img src="https://img.shields.io/badge/VS%20Code-%5E1.72-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code ^1.72" /></a>&nbsp;
  <a href="#"><img src="https://img.shields.io/badge/tests-100%20passing-22C55E?style=flat-square" alt="100 passing tests" /></a>&nbsp;
  <a href="#"><img src="https://img.shields.io/badge/AI%20context-md%20%2B%20json-0EA5E9?style=flat-square" alt="AI context" /></a>
</p>

<br/>

<p align="center">
  <strong>Track code comments as real tasks, style them richly, and export AI-ready context without leaving VS Code.</strong>
</p>

<br/>

<!-- PLACEHOLDER: screenshot -->

TaskVision turns TODO-style comments into a task board inside the Explorer. It still does the classic work well — highlight tags, show them in a tree, jump back to code — but now it also supports inline task states, priority and note metadata, AI context export, status reports, and state-aware filtering.

```bash
code --install-extension A-Znk.taskvision
```

![TaskVision Screenshot](resources/PixPin_2026-02-21_01-04-22.png)

> [!IMPORTANT]
> TaskVision 2.0 uses a **four-channel highlight model**. Styling scopes are now split into `colorType`, `glowType`, `glassType`, and `fontType`.

---

## Features

<table>
<tr>
<td width="50%">

**Task Management**
- Highlight TODO-style tags and markdown checkboxes in source comments
- Show tasks in tree, flat list, or tags-only view
- Parse inline states: `[todo]`, `[blocked]`, `[review]` ...
- Distinguish `task`, `context`, and `review` annotations in the tree
- Store stable IDs, priority, notes, and context refs in `.taskvision/tasks-meta.json`

</td>
<td width="50%">

**AI Integration**
- Export `ai-context.md`, `ai-context.json`, `ai-status-report.md`
- Persist context cards in `context-index.json`
- Persist planning/review sessions in `change-sessions/*.json`
- Let external AI tools write source annotations and reconcile them through official commands
- Exclude generated context from scans to prevent self-references
- Compatible with Claude Code, Codex, and any Markdown/JSON consumer

</td>
</tr>
</table>

---

## Task States

TaskVision supports these built-in task states:

| State | Meaning | State | Meaning |
| :---: | :--- | :---: | :--- |
| `todo` | Planned work that should be addressed | `review` | Implemented, waiting for confirmation |
| `doing` | Work currently in progress | `done` | Completed |
| `blocked` | Waiting on an external dependency | `wontdo` | Explicitly declined |
| `paused` | Intentionally deferred | `idea` | Observation or future direction |

```ts
// TODO [todo] [tv:id=task.refactor-cache-invalidat.13c895] refactor cache invalidation
// TODO [blocked] [tv:id=task.waiting-for-the-api-sche.34bfd1] waiting for the API schema
// TODO [review] [tv:id=task.retry-flow-rewritten-pen.abfec3] retry flow rewritten, pending QA
// NOTE [idea] [tv:id=task.split-parser-and-rendere.b13966] split parser and renderer
```

**Compatibility rules:**

| Shorthand | Resolves to |
| :--- | :--- |
| `[ ]` | `todo` |
| `[x]` / `[ x]` | `done` |
| `NOTE` / `IDEA` | `idea` |
| plain `TODO` (no state) | `todo` |

---

## AI Collaboration Syntax

TaskVision supports extra inline directives after the tag / status pair:

```ts
// TODO [todo] [tv:id=task.auth-refresh.c3f12a] fix refresh concurrency
// NOTE [idea] [tv:id=ctx.auth-refresh.8a91de] [tv:ctx=invariant] refresh must stay single-flight
// NOTE [review] [tv:session=sess.20260308.codex.001] [tv:task=task.auth-refresh.c3f12a] [tv:review=verify] verify retry flow
```

Three source annotation classes are recognized:

| Class | Typical form | Purpose |
| :--- | :--- | :--- |
| `task` | `TODO/FIXME/[ ]/[x] + [tv:id]` | Work item tracked in task state flow |
| `context` | `NOTE [idea] + [tv:ctx=...]` | Human or AI-authored constraint / invariant / decision |
| `review` | `NOTE [review] + [tv:session=...] + [tv:review=...]` | Session-scoped AI review or follow-up note |

Supported `tv:` directives:

| Directive | Meaning |
| :--- | :--- |
| `[tv:id=...]` | Stable ID for a task or context anchor |
| `[tv:ctx=...]` | Context kind: `must-read`, `constraint`, `invariant`, `decision`, ... |
| `[tv:task=...]` | Task stable ID(s) linked to a context or review note |
| `[tv:review=...]` | Review kind: `changed`, `why`, `risk`, `verify`, `blocked`, `followup` |
| `[tv:session=...]` | Active planning / review / implementation session ID |

---

## Tree Workflow

TaskVision supports a full task + AI collaboration workflow directly from the tree:

| Action | What it does |
| :--- | :--- |
| **Set Task Status** | Rewrites the inline `[status]` token in source |
| **Set Task Priority** | Stores priority in `.taskvision/tasks-meta.json` |
| **Edit Task Note** | Stores extra context for summaries and handoff |
| **Add Context Annotation** | Inserts a `NOTE [idea] [tv:ctx=...] ...` context anchor above the current line |
| **Start Agent Session** | Creates or switches the active workspace session used by AI review notes |
| **Write Agent Annotations** | Inserts `NOTE [review] [tv:session=...] [tv:review=...] ...` above the current line |
| **Sync Data Model** | Reconciles source annotations, sidecar JSON stores, and exported AI context |
| **Add Missing Inline Statuses** | Backfills status tokens for visible tasks without one |
| **Filter By Status** | Filters the tree by one or more states |
| **Clear Status Filter** | Resets the state filter |

> [!NOTE]
> - Bulk backfill works on the current visible scope.
> - When triggered from a context menu (folder / file / tag / task / context / review), only that subtree is affected.
> - Generated AI files are ignored by scans, so opening them will not pollute the tree.
> - Task nodes show task metadata, context nodes show `ctx:<kind>`, and review nodes show `review:<kind>`.

---

## AI Context Export

TaskVision exports a stable handoff bundle for any external coding assistant:

```
.taskvision/
├── ai-context.md                 # Human-readable unified context bundle
├── ai-context.json               # Machine-readable unified context bundle
├── ai-status-report.md           # Task status change summary
├── tasks-meta.json               # Task metadata and stable ID index
├── context-index.json            # Context cards linked to source anchors
└── change-sessions/
    └── sess.<date>.<actor>.<n>.json
```

`ai-context.json` v2 includes:

- `tasks`: exported task nodes with stable IDs, priority, notes, and linked context refs
- `contexts`: related context cards from `context-index.json`
- `openSessions`: open planning/review sessions from `change-sessions/`
- `readOrder`: the recommended AI reading order

Minimal shape:

```json
{
  "version": 2,
  "generatedAt": "2026-03-08T12:34:56.000Z",
  "workspaceRoot": "/workspace",
  "scope": "visible-tree",
  "tasks": [],
  "contexts": [],
  "openSessions": [],
  "readOrder": []
}
```

<details>
<summary><strong>Recommended AI Contract</strong></summary>

<br/>

| Rule | Description |
| :--- | :--- |
| Use official sync | Change source annotations, then run `Sync Data Model` or `Export AI Context` |
| Prefer `review` | Use `review` over `done` when verification is incomplete |
| Hands off sidecars | Do not edit `.taskvision/*.json` directly unless TaskVision generated the change |
| Report changes | Report which stable task or session IDs changed and why |

</details>

### Minimal Workflows

1. Add or select a task, then run **Add Context Annotation** to attach a constraint or invariant.
2. Run **Start Agent Session**, then use **Write Agent Annotations** to capture review notes with a live session ID.
3. Run **Export AI Context** to rebuild sidecars and produce a unified bundle for the next agent.

---

## Highlight Model

TaskVision uses four independent styling channels:

```
┌─────────────────────────────────────────────────┐
│  colorType   →  where text color applies        │
│  glowType    →  where neon glow applies         │
│  glassType   →  where background glass applies  │
│  fontType    →  where weight / italic / deco     │
└─────────────────────────────────────────────────┘
```

**Supported scopes:** `tag` · `text` · `tag-and-comment` · `text-and-comment` · `tag-and-subTag` · `line` · `whole-line` · `none`

**Scheme rules:**

| Scheme | Effect |
| :--- | :--- |
| `"neon"` | Enables glow preset |
| `"glass"` | Enables glass preset |
| `"neon+glass"` | Enables both |

> `scheme` controls presets only — it no longer decides scope.

---

## Quick Start

Add a minimal setup to `settings.json`:

```jsonc
"taskvision.highlights.customHighlight": {
  "TODO": {
    "icon": "tasklist",
    "foreground": "#42A5F5",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "FIXME": {
    "icon": "flame",
    "foreground": "#FF5252",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "[ ]": {
    "icon": "issue-opened",
    "foreground": "#26C6DA",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "[x]": {
    "icon": "issue-closed",
    "foreground": "#2E7D32",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  }
}
```

Then try these comments:

```ts
// TODO [todo] [tv:id=task.ship-the-new-onboarding.cdff7a] ship the new onboarding
// TODO [blocked] [tv:id=task.waiting-for-legal-copy.7cb8c0] waiting for legal copy
// TODO [review] [tv:id=task.shortcut-handler-updated.d073a3] shortcut handler updated
// NOTE [idea] [tv:id=task.split-command-and-render.96ab70] split command and render layers
```

### Per-channel brightness

Highlight rendering is layered. You can tune text, glow, glass fill, and glass border independently:

```jsonc
"taskvision.highlights.foregroundOpacity": 90,
"taskvision.highlights.glowOpacity": 45,
"taskvision.highlights.glassOpacity": 12,
"taskvision.highlights.glassBorderOpacity": 30
```

The same keys also work per tag inside `taskvision.highlights.customHighlight`. Legacy `opacity` is still supported as an alias for `glassOpacity`.

---

## Settings

| Setting | Default | Purpose |
| :--- | :---: | :--- |
| `taskvision.tree.showStatusPrefix` | `true` | Prefix default labels with `[status]` |
| `taskvision.tasks.defaultPriority` | `normal` | Default priority for tasks without metadata |
| `taskvision.aiContext.outputDir` | `.taskvision` | Output folder for AI context files |
| `taskvision.aiContext.respectCurrentFilters` | `true` | Export only the currently visible tree scope |

---

## FAQ

<details>
<summary><strong>Why did my generated AI context stop showing up in the tree?</strong></summary>
<br/>
TaskVision intentionally excludes the output folder from scans to prevent self-reference loops.
</details>

<details>
<summary><strong>Why did a task get a status even though I never wrote one?</strong></summary>
<br/>
TaskVision derives a default state from the tag. Use <code>Add Missing Inline Statuses</code> if you want those defaults written back into source.
</details>

<details>
<summary><strong>Why do appearance changes sometimes seem to ignore user settings?</strong></summary>
<br/>
Workspace settings in <code>.vscode/settings.json</code> override global settings, and TaskVision writes appearance changes to workspace settings first when possible.
</details>

---

## Project Structure

```
src/
├── extension.js         # Main extension entry and commands
├── tree.js              # Tree provider and node presentation
├── taskState.js         # Task state model
├── taskMetaStore.js     # Task metadata store + stable index
├── contextStore.js      # Context card sidecar store
├── changeSessionStore.js# Session sidecar store
├── annotationParser.js  # `tv:` directive parser
└── aiContext.js         # Unified AI context renderer
```

---

<p align="center">
  <sub>MIT License &copy; 2026 TaskVision</sub>
</p>
