# TaskVision AI Context

- Generated at: `2026-03-07T13:25:40.703Z`
- Workspace root: `/Users/a-znk/code`
- Scope: `visible-tree`

## Task State Rules

- Allowed states: `todo`, `doing`, `blocked`, `paused`, `review`, `done`, `wontdo`, `idea`
- Allowed priorities: `critical`, `high`, `normal`, `low`, `trivial`
- Inline status format: `[status]` immediately after the tag
- AI may only change inline status tokens in source comments
- Prefer `review` over `done` when code changed but verification is incomplete
- Do not change `blocked`, `paused`, or `wontdo` without a clear reason in the task body or follow-up report
- Do not modify `.taskvision/tasks-meta.json` directly

## Recommended Status Flows

- `todo` -> `doing`, `blocked`, `paused`, `review`, `done`, `wontdo`
- `doing` -> `review`, `blocked`, `paused`, `done`
- `blocked` -> `todo`, `doing`, `paused`, `wontdo`
- `paused` -> `todo`, `doing`, `wontdo`
- `review` -> `done`, `todo`, `doing`, `blocked`
- `done` -> `review`
- `wontdo` -> `todo`, `idea`
- `idea` -> `todo`, `paused`, `wontdo`

## Tasks

### .taskvision/ai-context.md:42
- Task ID: `822a55048eb9e9d5fa8bf94e27baf20748e32459`
- Tag: `[x]`
- Status: `done`
- Priority: `normal`
- Note: (none)
- Text: # [x]
- Sub tag: (none)
- Source excerpt:

```text
  41 |   35 | 
> 42 | > 36 | # [x]
  43 |   37 | 
```

### .taskvision/ai-context.md:58
- Task ID: `0b96303d9caf21fe5d23e21161d03263235cd807`
- Tag: `[x]`
- Status: `done`
- Priority: `normal`
- Note: (none)
- Text: 安全的拒绝类前缀（仅强调图片隐私,无 may）
- Sub tag: (none)
- Source excerpt:

```text
  57 |   117 | 
> 58 | > 118 | # [x] 安全的拒绝类前缀（仅强调图片隐私,无 may）
  59 |   119 | PREFIX_SAFE = (
```

