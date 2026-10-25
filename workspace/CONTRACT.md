# Historical 2.1 preview contract — superseded in 3.0

This file records the earlier implementation plan. Current authoritative architecture and acceptance are `agent/refactor-acceptance.md`, `packages/shared/src/types.ts`, and `workspace/README.md`. The old JavaScript/ownership/build choices below are historical, not instructions for current work.

## Original implementation contract (2026-10-25)

Human explicitly authorized rebuilding TaskVision on Mac mini after agreeing the following scope. This authorization covers the architecture/dependencies below; no Marketplace release, remote push, global agent configuration changes, or unrelated cleanup is authorized in this run.

## Outcome and boundary
Preserve the existing 2.0.1 extension/highlight/tree/export behavior. Add an opt-in local-first workspace: human-readable CORE / REUSE / INTENT / REVIEW annotations; project structure visualization; source-comment and Web human guidance; MCP + Skill access; multi-agent task leases and review. Implement and test a usable vertical slice, not a mock UI or an autonomous agent orchestrator.

Runtime: separate Node >=22.18 ESM workspace/ package, node:sqlite built-in (experimental warning documented). Existing extension remains CommonJS / Webpack4 and does not load SQLite in its extension host. Reuse src/annotationParser.js via createRequire; no duplicate tv: grammar. Legacy sidecars are read-only imports, never overwritten by the new database. New shared knowledge, task leases, reviews and event log in SQLite at git-common-dir/taskvision/workspace.sqlite; non-git fallback .taskvision/workspace.sqlite. Source tags remain authoritative in source. Web-only notes live in DB; provide explicit export, NOT an unimplemented automatic Git sync claim. Each worktree is indexed against its own source; repository-scoped Web guidance and coordination are shared. No cloud calls, embeddings, model API keys, or autonomous code execution.

## Ownership
A: workspace/core/** and workspace/test/core*.test.mjs only.
B: workspace/server.mjs, workspace/mcp.mjs, workspace/cli.mjs, workspace/test/transport*.test.mjs, workspace/skills/**, workspace/README.md only.
C: workspace/public/** and workspace/test/ui*.test.mjs only.
Main: package manifests/locks, VS Code integration, repository governance, browser acceptance and integration fixes. Do not modify another owner's files or shared docs. Report findings in your final response, no commits/pushes. New dependencies only via main.

## Core interface — MUST match across workers
workspace/core/index.mjs exports createWorkspace(root, options={}) returning { dispatch(operation, args={}, actor={role:'agent',id:'agent'}), close() }. dispatch is synchronous (callers may await). Errors have code (INVALID_ARGUMENT, NOT_FOUND, CONFLICT, FORBIDDEN, STALE) and message; callers map codes to HTTP status 400/404/409/403/409.

Annotation: { id, tag:'CORE'|'REUSE'|'INTENT'|'REVIEW'|'TODO', summary, body, path, line, endLine, origin:'source'|'web'|'legacy', author, status:'active'|'proposed'|'needs-review'|'resolved', revision, fileHash, freshness:'current'|'stale'|'missing', contextKind?, symbol? }. line is 1-based, path is repo-relative POSIX or empty for repository-scoped guidance. Web notes have optimistic integer revisions. Source ID should honor tv:id, otherwise stable content key; no source rewrites during indexing. Source comments must be real comment-prefix lines, not arbitrary occurrences in strings/docs.

Operations:
- snapshot {} -> { project:{name,root,branch,head,workspaceId,storePath}, revision:number, files:[{path,language,lines,tags:string[],annotationCount,symbols:[{name,line,kind}]}], annotations:Annotation[], tasks:Task[], claims:Claim[], reviews:Review[], edges:[{from,to,kind,provenance}], limits:{truncated:boolean,scannedFiles:number,maxFiles:number} }. Real containment/import relationships only; lightweight parsing explicitly labelled, not a complete call graph.
- context {query?,tag?,path?,limit?} -> {revision,annotations,tasks,readOrder:[{path,line,reason}]}. Include applicable repository/module guidance along with matching candidates; hard cap output.
- source {path} -> {path,text,hash,lines}. Max512KiB, text-only, allowlisted code/docs paths, reject traversal/absolute paths/symlinks/secret files/.git/node_modules/generated trees.
- annotation_upsert {id?,tag,summary,body?,path?,line?,expectedRevision?} -> {annotation,revision}. New human Web notes active, agent notes proposed. No caller-provided author/role. Existing update requires expectedRevision; agent cannot rewrite confirmed human guidance. Validate anchors/files/bounds.
- edit_source_annotation {id,summary,expectedHash} -> {annotation,revision}. Human-only, compare file SHA256; modify ONLY the matched comment's text, preserve comment prefix, tags/tv directives/line endings, atomic replacement, refuse ambiguous/missing/stale anchors. Never replace whole files from browser arbitrary code.
- task_create {title,description?,paths:string[],dependsOn?:string[]} -> {task,revision}. Task {id,title,description,paths,dependsOn,status:'todo'|'doing'|'review'|'done',owner?,updatedAt}. Validate scopes and dependency existence.
- task_claim {taskId,agentId,ttlSeconds?:number} -> {task,claim,revision}. Claim {taskId,agentId,token,expiresAt,paths,workspaceId}. BEGIN IMMEDIATE transaction; reject unexpired other owner, blocked dependencies and overlapping scopes; expired claims reclaimable. TTL 30..3600. Leases advisory, not OS-enforced locks.
- task_heartbeat {taskId,agentId,token,ttlSeconds?} -> {claim,revision}. Reject expired/stale token; fencing tokens cannot be reused.
- task_release {taskId,agentId,token} -> {task,revision}. Reject stale token.
- review_submit {taskId,agentId,token,summary,paths?:string[],evidence?:string[]} -> {review,task,revision}. Bind current workspace/head and source hashes; require valid lease. Task becomes review. Review {id,taskId,summary,paths,evidence,status:'pending'|'accepted'|'changes-requested',workspaceId,head,fileHashes,createdAt}. Evidence is agent-reported until human checks.
- review_resolve {reviewId,decision:'accepted'|'changes-requested',note?} -> {review,task,revision}. HUMAN-only; refuse approval of changed source hashes or a different worktree. Accept makes done; changes-requested makes todo. Agent cannot self-approve by input role spoofing.
- updates {after?:number,limit?:number} -> {events:[{sequence,type,actor,createdAt,payload}],cursor:number,hasMore:boolean}. Paginated monotonic DB sequence; snapshot revision compatible with events. Source rescan changes can emit source-changed events (avoid spurious every-read events).
- export {} -> {version:1,project,annotations,tasks,reviews}. Read-only JSON export; no automatic Git-tracked persistence claim.

Security: deny path escape including symlinks, .env and credentials/private keys, honor gitignore and hard excludes, cap scanning (default 2000 files), payload and source bytes. Never execute repository code or tools automatically. SQL parameterized, WAL + busy_timeout. Unrelated OS-shell agents with full same-user filesystem access are NOT isolated by these application roles. Do not overclaim security.

## HTTP contract (B) for Web (C)
startServer({root,port:0}) exported async -> {server,url,close(),token}; direct node server.mjs --root PATH --port 4317 prints actual URL and readiness JSON to stderr/stdout as appropriate. Loopback 127.0.0.1 only. Human UI static root served with strict CSP, no CDN dependencies. Validate Host incl port and Origin. No permissive CORS. GET /api/bootstrap returns {token, snapshot} with no-store, only same-origin + valid Host. Token returned to same-origin JS; mutations require X-TaskVision-Token header plus JSON content type and valid origin if supplied. Local OS processes remain trusted (document).
GET /api/snapshot -> snapshot; GET /api/source?path= -> source; GET /api/updates?after= -> updates; GET /api/export -> export download. POST /api/operation body {operation,args}, operations explicit allowlist, actor injected {role:'human',id:'human'} server-side. GET token bootstrap not a remote-auth mechanism. Invalid Host/Origin requests denied including bootstrap. Body <=128KiB, source escapes forbidden. Poll snapshot/updates every 2s with visibility/backoff; preserve unsaved input.
MCP stdio @modelcontextprotocol/sdk 1.32.2 with zod 4.6.7. Register `taskvision_snapshot`, `taskvision_context`, `taskvision_annotation_upsert`, task_create/claim/heartbeat/release, review_submit, updates, source. No MCP human approval / source-write tools. Actor role always agent; annotate tool output as untrusted project content. Clean stdout JSON-RPC only. Test real initialize/tools/list/tools/call via official SDK client. CLI node cli.mjs --root PATH <operation> [JSON] defaults agent, cannot accept role=human. CLI snapshot/context/export allow user inspection.

## Web C
Chinese-first engineering workbench, restrained high contrast, compact typography, minimal rounded cards. Three coordinated areas: file tree, project/module map or tagged-code/review/coordination tabs, inspector with source lines + notes. Real API data only, no fabricated agents/metrics. Tag filters, search, clickable path/symbol navigation. Real grouped module map from actual file/edge data; no giant unreadable call graph; label lexical structure limitations. Human add/edit annotation, source-annotation edit using expectedHash, create tasks, review accept/request-changes, export. Show pending/stale/agent-proposed states distinctly. Empty/loading/error/conflict states and responsive layout; no innerHTML for project data; no CDN. Human guidance added in Web must appear via MCP/context without restart; source edits visible next rescan. Accessible inputs/buttons and keyboard selection.

## Acceptance cases BEFORE implementation
1 existing legacy QUnit suite + webpack still pass.
2 same source tags visible via snapshot, Web and MCP; source edits refresh without restart.
3 browser note -> context/MCP; stale revision and stale source writes rejected.
4 competing agents cannot simultaneously claim same/overlapping task; leases fenced; Git worktrees share claims.
5 pending review requires human acceptance and exact source fingerprint; agent cannot self approve.
6 path traversal, symlink secret leak, hostile Origin/Host, missing token, malformed/oversized input denied.
7 browser interactions at desktop and narrow viewport, no console errors, capture real screenshot.
8 explicit known limits: local-first, Node22 runtime, advisory scopes, lightweight structure parsing, DB-only web notes until export; no cloud, scheduler, or automatic semantic verification.
