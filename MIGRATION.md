# TaskVision 2.0 Migration Guide

## Breaking Changes
- Configuration namespace changed from `todo-tree.*` to `taskvision.*`.
- Command IDs changed from `todo-tree.*` to `taskvision.*`.
- View/container IDs changed:
  - `todo-tree-container` -> `taskvision-container`
  - `todo-tree-view` -> `taskvision-view`
- Context keys in `when` clauses changed from `todo-tree-*` to `taskvision-*`.

## Configuration Mapping
All 70 configuration keys now follow this direct mapping rule:

`todo-tree.<group>.<name>` -> `taskvision.<group>.<name>`

Examples:
- `todo-tree.general.tags` -> `taskvision.general.tags`
- `todo-tree.highlights.customHighlight` -> `taskvision.highlights.customHighlight`
- `todo-tree.tree.scanMode` -> `taskvision.tree.scanMode`
- `todo-tree.regex.regex` -> `taskvision.regex.regex`
- `todo-tree.ripgrep.ripgrepArgs` -> `taskvision.ripgrep.ripgrepArgs`

## Command Mapping
All command IDs now follow this direct mapping rule:

`todo-tree.<command>` -> `taskvision.<command>`

Examples:
- `todo-tree.refresh` -> `taskvision.refresh`
- `todo-tree.scanWorkspaceOnly` -> `taskvision.scanWorkspaceOnly`
- `todo-tree.addTag` -> `taskvision.addTag`
- `todo-tree.customizeAppearance` -> `taskvision.customizeAppearance`

## Automatic Settings Migration
On first startup after upgrading to 2.0, TaskVision performs a one-time migration:
- Reads legacy settings from the old namespace.
- Writes values into the new namespace when the new key is not already set.
- Preserves scope (Global / Workspace / Workspace Folder).
- Marks migration completion using internal version `2000`.

## Removed Compatibility
- Old `todo-tree.*` command IDs are no longer registered.
- Runtime reads only `taskvision.*` settings after migration.

## Validation Checklist
- Run `TaskVision: Refresh` and confirm tree/commands work.
- Check `settings.json` for `taskvision.*` keys.
- Ensure there are no active `todo-tree.*` key references in your workspace settings.
