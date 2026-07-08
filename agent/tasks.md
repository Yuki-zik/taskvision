# Current Tasks

| Priority | Task                                                                                        | Status        | Owner      | Due        |
| -------- | ------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------- |
| P1       | Sync repository root `AGENTS.md` with the governance rules in `agent/agents.md`             | ✅ Completed   | AI         | 2026-03-08 |
| P1       | Establish `agent/` governance docs and add project management guidance in `agent/agents.md` | ✅ Completed   | AI         | 2026-03-08 |
| P2       | Keep `agent/timeline.md` and `agent/tasks.md` in sync with every future code or doc change  | ⏳ In Progress | AI + Human | Ongoing    |
| P2       | Review whether a lint command should be added to complement the existing QUnit suite        | ⏳ Pending     | Human      | TBD        |

## 升级调研 Session (2026-06-16)

- 产出:`agent/reports/taskvision-upgrade-research-2026-06-16.md` —— 跨模型 deep-research 升级 roadmap(websearch+gh+codex search 三通道核实 + `mcp__codex__codex` 对抗 REVISE→reconcile;**未改任何源码/构建**)
- 核心结论:差异化护城河 = 代码锚定扫描 + 状态机 + context refs + change-session;**P0** = `LanguageModelTool`(VS Code/Copilot)或 MCP(跨客户端)双 agent surface + 只读共享核心 + 安全护栏(prompt-injection 防护)+ 类型化窄适配层
- 后续可落地任务(尚未排期,待人决策):P0 地基四件套 → P1 context-pack 富化 / agentability 确定性标签 / Webpack4→esbuild

## Session Summary

- Active focus: Reworked highlight acrylic so the default effect is text-layer glow/underline without background fill, border blocks, or hidden text.
- Verification: `npx qunit test/highlights.tests.js test/schemes.tests.js`, `npm test`, `npm run webpack`, CDP screenshot `/tmp/taskvision-cdp-visual-final-pass2.png`, visual subagent review, and targeted `git diff --check` passed.

## Active Session Task

| Priority | Task                                  | Status        | Owner | Due        |
| -------- | ------------------------------------- | ------------- | ----- | ---------- |
| P1       | Rework glass highlight transparency model          | Completed     | AI    | 2026-06-04 |
