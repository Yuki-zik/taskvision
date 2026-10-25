# TaskVision Project Overview

## Goal

TaskVision is a VS Code extension that turns TODO-style source comments into structured tasks. It provides task highlighting, tree-based navigation, inline status workflows, metadata sidecars, and AI context export for external coding agents.

## Architecture

```text
+-------------------+        +-------------------+
| VS Code Host      | -----> | src/extension.js  |
| commands/events    |        | activation/orches |
+-------------------+        +---------+---------+
                                        |
                 +----------------------+----------------------+
                 |                      |                      |
                 v                      v                      v
        +----------------+     +----------------+     +------------------+
        | Search/Parse    |     | Render/Tree    |     | AI/Task Metadata |
        | ripgrep.js      |     | highlights.js  |     | aiContext.js     |
        | utils.js        |     | tree.js        |     | taskMetaStore.js |
        | taskState.js    |     | styleComposer  |     |                  |
        +----------------+     +----------------+     +------------------+
```

## Core Modules

- `src/extension.js`: extension entrypoint, command registration, workspace event wiring, export actions.
- `src/highlights.js`: editor decoration pipeline for the four-channel highlight model.
- `src/tree.js`: task tree provider, grouping, filtering, commands bound to tree actions.
- `src/taskState.js`: inline task status parsing and normalization.
- `src/taskMetaStore.js`: sidecar metadata persistence for priority and notes.
- `src/aiContext.js`: markdown/json/status report export for external AI workflows.
- `src/ripgrep.js`: workspace search integration and argument construction.
- `src/utils.js`: shared parsing, formatting, and regex helpers.
- `test/*.tests.js`: QUnit-based regression coverage for core behaviors.

## Tech Stack

- Runtime: Node.js
- Product type: VS Code extension
- Bundler: Webpack 4
- Tests: QUnit
- Language: JavaScript (CommonJS)

## Dependencies

### Runtime

- `@primer/octicons`
- `comment-patterns`
- `fast-strftime`
- `find`
- `micromatch`
- `regexp-match-indices`
- `treeify`

### Development

- `qunit`
- `webpack`
- `webpack-cli`
- `parse-code-context`

## Current Quality Baseline

- Test command: `npm test`
- Latest verified result: `145 passing`, `0 failed` on `2026-06-05`
- Build commands: `npm run webpack`, `npm run webpack-dev`

## Maintenance Notes

- Generated AI output lives under `.taskvision/` and should stay excluded from normal scans.
- Project governance documents live under `agent/` and must be updated at session start and end.

## 2026-10-25 Knowledge Workspace preview

The 2.1.0 local preview preserves the CommonJS VS Code extension and adds a separate Node22 ESM `workspace/` runtime. `src/knowledgeWorkspace.js` is an opt-in process bridge. `workspace/core` reuses `src/annotationParser.js`, scans actual source, stores Web knowledge and transactional coordination in the Git common directory, and enforces optimistic edits and human review gates. `server.mjs`, `mcp.mjs` and `cli.mjs` share the dispatch layer. `public/` is a dependency-free local Web UI; `skills/taskvision-workspace/` documents Agent behavior.

Run `npm test`, `npm run workspace:test`, `npm run webpack` and `npm run package:preview`. Detailed limits, permissions and commands are in `workspace/README.md`. The legacy `.taskvision` stores remain separate; the new runtime only reads legacy contexts and never overwrites them.
