# TaskVision 3.8.2 — VS Code native usability and bilingual acceptance

Date: 2026-10-28. Branch: fix/vscode-native-usability-i18n-20261028. Base: 3.8.1 commit 1d02881.

## Findings and changes

TaskVision 3.8.1 worked in VS Code, but its TODOs area title obscured newer knowledge/Review features. The manifest exposed 55 commands and 80 settings, with two English-only setting group titles and approximately 33 raw English descriptions in highlighter and other settings. Native tree status and highlighter pickers stayed in English.

3.8.2 adds a three-step bilingual Getting Started QuickPick for reading annotated source, opening the optional Web workspace, and copying an Agent MCP configuration. A Node.js 22.18+ troubleshooting entry is available; opening/canceling does not change settings. The primary Quick Actions Enter key still opens the knowledge workspace. The Activity Bar says TaskVision and the native view shows Tasks & Knowledge / 任务与知识. Native Settings metadata and nested style schemas use translated strings; both NLS catalogs contain 183 aligned keys for the original 80 settings. Common task status, priority, note, tag, tree scan/filter and highlighter preset/channel menus are localized without translating persisted values or changing custom settings. EN/ZH README has a three-minute native introduction and explains Node.js is required only for the optional Web/MCP workspace.

## Verified evidence

| Scope | Result |
|---|---|
| QUnit extension and new bilingual tests | 188/188 pass |
| Core / HTTP / MCP | 64/64 pass |
| Web model/graph/syntax | 107/107 pass |
| Actual Chrome workflow suite | 10/10 pass |
| TypeScript / Prettier / production build | pass |
| Isolated installed English VS Code Extension Host 3.8.2 | pass: 11 commands, real Settings and Quick Actions and Getting Started canceled without mutation, real editor, tags, MCP config, local HTTP and Web 200, service cleanup |
| Chinese mock host and NLS coverage | pass: zh-cn menu contents, stable status and scheme identifiers, 183 translated keys each |
| Real graphical Chinese VS Code | NOT COMPLETE. The isolated official Simplified Chinese language pack was installed and --locale zh-cn specified, but the test Extension Host still reported vscode.env.language=en. Do not claim actual Chinese GUI verification. |
| VSIX audit | 108 files, 41 matching JS/MJS/CSS/HTML runtime hashes, zero private/key/font content |

Package: artifacts/taskvision-3.8.2-preview.vsix
SHA256: 228d6976494355e1544f85d8d4ffc42db05ba658bcf4d63000dc8a4db644f46d
Original test logs are retained locally; they are not part of this repository checkpoint.
Isolated test evidence: the private local native-UX evidence directory.

## Limits

80 advanced settings remain visible; the new guide reduces the initial cognitive burden without hiding power-user options. Some rare legacy dialog and status-bar messages remain in English. Native UI snapshots from 3.8 verify original neon and task tree, but no comprehensive new Simplified Chinese GUI screenshot or human usability study is claimed. At the 2026-10-28 acceptance, there was no remote push, Marketplace publication or default VS Code replacement. Preexisting user .taskvision/ai-status-report.md changes untouched.

## Checkpoint note — 2026-11-02

This is the historical local acceptance record. The current source synchronization and fresh-checkout verification are tracked in [the cloud checkpoint](cloud-sync-20261102.md). Private logs, user state and lease credentials are excluded.
