# TaskVision 3.8 - click-first floating details + VS Code native usability

User feedback: cards alone do not expose enough information. One click on a graph node must show a separate well-designed floating detail card, without resizing/replacing the diagram or requiring a fixed sidebar. Also audit and improve the native VS Code extension's actual appearance, settings discoverability and Activity Bar/task tree ergonomics. Verify with real host/GUI, not command-registration-only tests.

Baseline 3.7.0, branch feat/click-detail-vscode-ux-20261027. Preserve true source relations, original editor tree/decorations, MCP+Review, project preferences, custom tags and unrelated user-modified .taskvision/ai-status-report.md (do not edit, restore or stage). No push, Marketplace publication or daily profile change.

## Graph interaction
- One click or keyboard Enter on module/file => separate floating detail card anchored near node, not content added to node and not automatically opening fixed inspector. Card stays screen-size at far zoom, flips/shifts inside viewport. Accurately show title/path, full summary, files/LOC/relationships, semantic tags, current claims/reviews/stale, bounded real source annotation preview with count. Dark/light contrast.
- Explicit close; Escape returns focus to node, outside click dismisses, clicking second node updates content; double click drills module and cancels popup. Source/expand/enter module/open deeper inspector buttons. Edge selection opens relation evidence and closes node popup; pan/drag reposition update or dismiss predictably. Avoid simultaneous large hover tooltip and click popup.
- Existing inspector dock for deeper edit/Review stays opt-in. Single node click must not invoke parent onModule/onSelect and resize graph. Deep source button does.
- Focused browser tests: click file/module, real content, another node, Escape focus, outside click, double click, far zoom, mobile viewport, project switch, no clipping or JS errors. Preserve all existing regression tests.

## VS Code native usability
- Verify actual installed VSIX + Extension Host: Activity Bar icon, tree and badges, highlighting of real comments, navigation to code, task actions, Quick Picks, settings UI. Take real screenshot when feasible.
- Native tree title prominent Web workspace, refresh, settings/quick actions; avoid overcrowding 29 commands. Discoverable "TaskVision: Configure Appearance and Workspace" command that opens scoped native VS Code Settings UI with tag/highlight paths. "TaskVision: Quick Actions" offers grouped open Web, tags, refresh, filter, AI, MCP, settings. User settings must not be silently overwritten.
- Audit original command list, menu registrations, English/Chinese names, existing defaults. Add actual command interaction tests, not inert buttons. Do not rebuild the legacy task tree.
- No automatic default 2.0.1 replacement. Separate isolated VS Code user-data/extension directory for 3.8 acceptance.

## Disjoint worker ownership
Web: apps/web/src/graph/GraphView.tsx, new apps/web/src/graph/NodeDetailPopover.tsx, new apps/web/src/graph/node-detail-popover.css, tests/e2e/click-node-detail.spec.ts, apps/web/test/detail-interaction.test.ts. May minimally adapt apps/web/src/graph/ArchitectureNode.tsx to avoid tooltip conflict. No App, package or server.
Native: src/knowledgeWorkspace.ts, new src/workspaceActions.ts, package.json command/menu contributions only, package.nls.json, package.nls.zh-cn.json, native action test files and workspace/test-extension/index.cjs. No Web, no unrelated core.
Main: build integration, source/manifest corrections, independent review, actual screenshots, tests, documentation, version, commit and package.
