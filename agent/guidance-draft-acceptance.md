# TaskVision 3.8.1 Preview — Source-anchored guidance draft integrity

Date: 2026-10-28 (Mac mini local). Branch: fix/anchored-guidance-drafts-20261028.
Base: 39d4f60, TaskVision 3.8.0.

## Problem reproduced before the code change

In a real Chrome browser using an isolated Git fixture, create unsaved human guidance for line 1 of a source file. Close its editor, select line 2, and open a new guidance editor. The second editor reused the previous localStorage draft and line 1. The first E2E test failed with expected line 2, received 1. That risked attaching a correct human intent to an incorrect source anchor.

## Implementation

- New guidance draft key now includes project workspace ID, source path and source line. The React editor instance key includes the line too.
- Existing annotation edits remain keyed by stable annotation ID.
- Compatible path-only legacy drafts are read and migrated only when their stored source line and path match the requested anchor, with the old key deleted only after the new key was saved. Mismatched legacy drafts are preserved.
- No SQLite schema, server/MCP contract, source edit behavior, extra runtime dependency or user settings change.

## Reproducible verification

| Suite | Actual result |
|---|---|
| New browser regression: selected source lines isolate drafts/reload | PASS |
| New browser regression: matching legacy migration and mismatched preservation | PASS |
| Full Chrome workflows.spec.ts | 10/10 PASS |
| Original VS Code/QUnit behavior | 182/182 PASS |
| Core/HTTP/MCP | 64/64 PASS |
| Web model/source/graph | 107/107 PASS |
| TypeScript typecheck, Prettier format and production build | PASS |
| Installed isolated VS Code 3.8.1 Extension Host | PASS, 10 commands, actual editor, native settings/Quick Actions, custom tag preservation, local Web HTTP 200, MCP config, stopped service |
| VSIX extracted independently, built Web/bootstrap/snapshot | HTTP 200 / 200 / 200, real source fixture indexed |

Build can still warn about previously known large Shiki/ELK chunks; warnings did not fail compilation.

## Package

- artifacts/taskvision-3.8.1-preview.vsix
- Size 3,179,102 bytes; SHA256 c9c3b534a0bb0d4ba57c57d5e21a4fd36c45b01e8a4b167011b26557cf3e9069
- 108 archive entries, 41 JS/MJS/CSS/HTML runtime assets SHA256-identical to the compiled runtime, zero private/font/key files.
- Original evidence is retained in the private local draft-isolation workbench; raw logs are excluded from this source checkpoint.

Not yet pushed to GitHub, Marketplace-published, installed into the user's daily extension profile or verified on Windows/Linux. The preexisting user-owned .taskvision/ai-status-report.md modification is deliberately left untouched.

## Checkpoint note — 2026-11-02

This is the historical local acceptance record. The current source synchronization and fresh-checkout verification are tracked in [the cloud checkpoint](cloud-sync-20261102.md). Private logs, user state and lease credentials are excluded.
