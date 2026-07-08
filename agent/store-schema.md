# TaskVision Store Schema

This document is the durable contract for files generated under `.taskvision/`.
Source comments remain the human-readable source of task facts; sidecar files store metadata, context cards, sessions, and export baselines.

## Store files

| File | Version | Owner | Purpose |
| --- | --- | --- | --- |
| `tasks-meta.json` | `version: 2` | TaskVision commands | Task metadata keyed by internal `taskId`, plus `stableIndex` for `stableId -> taskId` lookup. |
| `context-index.json` | `version: 1` | TaskVision commands | Long-lived context cards keyed by `contextId`. |
| `change-sessions/*.json` | `version: 1` | TaskVision commands | Agent planning/review sessions keyed by `sessionId`. |

## `tasks-meta.json`

```json
{
  "version": 2,
  "tasks": {
    "<taskId>": {
      "stableId": "task.<slug>.<6-hex>",
      "priority": "normal",
      "note": "",
      "acceptanceCriteria": [],
      "nonGoals": [],
      "contextRefs": [],
      "lastActor": "user",
      "updatedAt": "2026-03-08T12:00:00.000Z",
      "lastExportedStatus": "todo",
      "lastExportedAt": "2026-03-08T12:00:00.000Z",
      "file": "src/example.js",
      "line": 10
    }
  },
  "stableIndex": {
    "task.<slug>.<6-hex>": "<taskId>"
  }
}
```

- `taskId` is an internal deterministic key derived from file, tag, text, and subtag.
- `stableId` is the durable cross-sidecar key surfaced as optional `tv:id`.
- `contextRefs` contains context IDs such as `ctx.cache.456def`.
- `stableIndex` must be rebuilt from `tasks` on load so stale indexes do not become authoritative.

## `context-index.json`

```json
{
  "version": 1,
  "contexts": {
    "ctx.<slug>.<6-hex>": {
      "kind": "invariant",
      "title": "Cache writes stay synchronous",
      "summary": "cache writes must stay synchronous",
      "body": "Do not defer cache writes past request completion.",
      "taskRefs": ["task.cache.123abc"],
      "anchors": [
        {
          "file": "src/cache.js",
          "line": 42,
          "tag": "NOTE"
        }
      ],
      "updatedBy": "user",
      "updatedAt": "2026-03-08T12:00:00.000Z",
      "freshness": "active"
    }
  }
}
```

- `contextId` is the object key and should match `ctx.<slug>.<6-hex>`.
- `taskRefs` must use task `stableId` values, not internal `taskId` values.
- `anchors` are source-location hints and are not the primary identity.

## `change-sessions/*.json`

```json
{
  "version": 1,
  "sessionId": "sess.20260308.codex.001",
  "sessionType": "review",
  "actor": "codex",
  "status": "open",
  "createdAt": "2026-03-08T12:00:00.000Z",
  "updatedAt": "2026-03-08T12:05:00.000Z",
  "taskRefs": ["task.cache.123abc"],
  "summary": "Review cache invalidation changes",
  "annotations": [
    {
      "annotationId": "ann.001",
      "kind": "verify",
      "file": "src/cache.js",
      "line": 42,
      "stableId": "ctx.cache.verify.9ab123",
      "sourceComment": true,
      "reviewState": "unread",
      "text": "Verify retry path"
    }
  ]
}
```

- `sessionId` is the file identity and must be stable.
- `taskRefs` must use task `stableId` values.
- `annotationId` is scoped to a single session file and must not be used as a cross-sidecar key.

## Migration policy

- Loaders must tolerate missing fields and normalize them to the current in-memory shape.
- `tasks-meta.json` currently upgrades to `version: 2` by rebuilding `stableIndex` and normalizing `contextRefs`.
- Future version bumps must preserve old files by reading first, normalizing, then writing the new version through the normal store writer.
- Unknown fields are not authoritative. New fields should be added through explicit normalization so malformed external writes do not become product state silently.

## Recovery policy

- Atomic write: JSON stores are written to a same-directory temporary file and then replaced with `rename`.
- If write or rename fails, the previous JSON file must remain intact and the in-memory cache must not preserve unpersisted mutations.
- If a JSON file is malformed, TaskVision renames it to a unique `.invalid` backup and recovers with an empty store.
- Generated `ai-context.md`, `ai-context.json`, and `ai-status-report.md` are export artifacts, not authoritative stores.

## Identity rules

- Use `stableId`, `contextId`, and `sessionId` for cross-file or cross-sidecar relationships.
- Use `taskId`, `annotationId`, and tree item IDs only for local/internal state.
- Source `tv:id` is an optional serialization of `stableId`; it is written only when durable tracking is required.
