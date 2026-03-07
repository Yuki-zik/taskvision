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
  <a href="#"><img src="https://img.shields.io/badge/tests-92%20passing-22C55E?style=flat-square" alt="92 passing tests" /></a>&nbsp;
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
- Store priority & notes in `.taskvision/tasks-meta.json`

</td>
<td width="50%">

**AI Integration**
- Export `ai-context.md`, `ai-context.json`, `ai-status-report.md`
- Let external AI tools update status by editing source comments
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
// TODO [todo]    refactor cache invalidation
// TODO [blocked] waiting for the API schema
// TODO [review]  retry flow rewritten, pending QA
// NOTE [idea]    split parser and renderer
```

**Compatibility rules:**

| Shorthand | Resolves to |
| :--- | :--- |
| `[ ]` | `todo` |
| `[x]` / `[ x]` | `done` |
| `NOTE` / `IDEA` | `idea` |
| plain `TODO` (no state) | `todo` |

---

## Tree Workflow

TaskVision supports a full task workflow directly from the tree:

| Action | What it does |
| :--- | :--- |
| **Set Task Status** | Rewrites the inline `[status]` token in source |
| **Set Task Priority** | Stores priority in `.taskvision/tasks-meta.json` |
| **Edit Task Note** | Stores extra context for summaries and handoff |
| **Add Missing Inline Statuses** | Backfills status tokens for visible tasks without one |
| **Filter By Status** | Filters the tree by one or more states |
| **Clear Status Filter** | Resets the state filter |

> [!NOTE]
> - Bulk backfill works on the current visible scope.
> - When triggered from a context menu (folder / file / tag / todo), only that subtree is affected.
> - Generated AI files are ignored by scans, so opening them will not pollute the tree.

---

## AI Context Export

TaskVision exports a stable handoff bundle for any external coding assistant:

```
.taskvision/
├── ai-context.md           # Human-readable task list
├── ai-context.json         # Machine-readable task data
└── ai-status-report.md     # Status change summary
```

**Exported data includes:** workspace root, export scope, allowed statuses & priorities, task IDs, file paths, lines, status, priority, notes, source excerpts, and workflow rules.

<details>
<summary><strong>Recommended AI Contract</strong></summary>

<br/>

| Rule | Description |
| :--- | :--- |
| Edit source only | Only modify inline status tokens in source comments |
| Prefer `review` | Use `review` over `done` when verification is incomplete |
| Hands off metadata | Do not edit `.taskvision/tasks-meta.json` directly |
| Report changes | Report which task IDs changed and why |

</details>

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
// TODO [todo] ship the new onboarding
// TODO [blocked] waiting for legal copy
// TODO [review] shortcut handler updated
// NOTE [idea] split command and render layers
```

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
├── extension.js       # Main extension entry
├── tree.js            # Tree provider
├── taskState.js       # Task state model
├── taskMetaStore.js   # Task metadata store
└── aiContext.js       # AI export renderer
```

---

<p align="center">
  <sub>MIT License &copy; 2026 TaskVision</sub>
</p>
