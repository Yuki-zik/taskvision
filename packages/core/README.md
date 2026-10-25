# TaskVision core

`src/index.ts` exports `createWorkspace(root, options): Workspace` against the fixed shared contract. Modules separate file security, syntax analysis, incremental indexing, SQLite storage, knowledge, validation and task/review coordination.

Reuse decisions:

- `workspace/core/scanner.mjs`: retain source format allowlists, excluded/secret paths, Git ignore inventory, no-follow reads, source editing rules and lexical fallback for other languages.
- `workspace/core/index.mjs`: retain the SQLite location, records/events/scans schemas, transaction fencing, worktree coordination, optimistic notes and human-only review decisions. Internal baseline/source records are additive record kinds; existing data is untouched.
- `src/annotationParser.ts`: import its named `parseDirectives` export, including legacy NOTE/FIXME and stable ID directives.
- The root-installed `typescript-parser` dependency supplies actual JS/TS AST parsing; other languages identify symbols/import provenance as lexical.

Index snapshots read only changed file contents, checking device/inode/size/mtimeNs/ctimeNs/mode and revalidating inventory/security on every poll. `stats` reports actual `readFiles`, `cachedFiles`, `scanMs` and `parseMs`. Review operations read scope bytes independently of that cache, include new/deleted files, and retain submission content separately from current content.

Claim/review text captures retain at most 4 MiB each; private capture records together retain at most 32 MiB of encoded data. Hash coverage remains complete when text is capped. Historical/missing/capped baselines are explicitly disclosed by `baselineAvailable`/`warning`. Private captures and lease tokens are not included in snapshots, exports or events.

Knowledge import accepts version 1, validates annotation records and destination anchors, previews record conflicts, and deterministically deduplicates source workspace/id pairs. Only active/proposed Web annotations transfer, always as proposed notes retaining the exported anchor fingerprint; hash mismatches are dry-run conflicts and remain stale until explicitly reanchored; tasks, claims and reviews never transfer. Missing/unsafe anchors produce conflicts instead of invented anchors.

Review fixes and compatibility:

- Internal scope coordinates use Git repository-relative paths, independent of the opened directory or checkout. Public paths are projected into the current workspace. A private workspace registry and optional record metadata are additive; SQLite tables and lease tokens remain unchanged.
- Legacy leases recover origin from their workspace ID, registered roots, ancestors and Git worktree roots. Recovery adds canonical scope metadata without rotating the fencing token or expiry. An active lease with an unknown origin conservatively blocks new claims until its origin workspace is opened or the lease expires. Unclaimed historical Git tasks with no origin evidence remain preserved but cannot be assigned guessed coordinates; create an explicitly scoped replacement. Legacy anchored notes require a matching local hash to establish their position.
- Notes anchored in sibling checkouts are not silently mapped onto current source. Nested workspaces in the same physical checkout project known anchors correctly. Tasks referring to files absent from another checkout remain visible without invented local paths; foreign Review snapshots omit local source positions.
- Review inventories walk only the requested scopes and apply `maxFiles` to the complete union of those scopes. An unrelated truncated UI index cannot block an explicit-file task. Directory capture includes new files, rejects unreadable/binary source and symlinks, validates Git ignores, and checks inventory/stat stability. It never accepts partial hashes.
- Context reserves capacity for matching results (matching REUSE first) and relevant guidance. `selection.matched` counts matches before bounding, `returned` counts actual annotations returned, and omission counts cover the match and guidance-only sets separately. `limits` carries snapshot completeness, including skipped/unreadable source.

Integration for main: rebuild the existing runtime outputs and rerun HTTP/MCP acceptance. Core fills the already-added shared `ContextResult.limits`/`selection` and `ReviewFile.current`/`currentHash`; no additional shared field is required. Keep the fixed ESM compatibility banner for the bundled pure JS `typescript-parser`. Governance and transports remain owned by main.

Focused verification: `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json`, the existing core/safety suites, `workspace/test/core.incremental.test.mjs` and `workspace/test/core.reviewfix.test.mjs` against an isolated bundled module. All five reviewer findings were reproduced as failing real SQLite/temp-Git tests before their fixes. No existing checks or strictness are disabled; parsing cache behavior remains covered by the original incremental tests.

Latest focused validation: 40/40 tests passed (31 existing core/incremental/safety checks plus 9 real SQLite/temp-Git review-fix checks); strict typecheck, Prettier and scoped diff checks passed. The five initial reproduction tests all failed before the fixes. HTTP/MCP runtime rebuild and transport acceptance remain with main.
