# TaskVision 3.0 重构与体验验收

用户已明确授权在 Mac mini 完整重构、采用推荐架构、重做图可视化、使用本机 Codex 实测并多轮检查。基线 f012814；分支 refactor/typescript-workbench-20261026。旧版 VSIX、Git 提交与 SQLite 一致性备份保留，不发布远端、不自动替换默认插件或修改全局 Codex 配置。

## 完成定义：用户能走通的路径

1. 从全新安装 VSIX 打开受信任工程，插件激活无错误，旧任务/注释/高亮可用；新增 Web/MCP 入口不用在扩展目录 npm install。未信任工程不启动进程。
2. 在结构图中缩放/拖动/自动布局/展开模块/定位文件，选择与源码、注释同步；节点不重叠，连线有方向且不穿过节点正文；筛选后仍能找到关键代码。真实数据、无假 Agent/指标。
3. 人类在网页加入项目或模块指导，Codex 通过真实 MCP context 读到；直接修改源码注释也能被新查询发现。多窗口冲突不丢草稿、不静默覆盖。
4. Codex 首先检索 REUSE 和 INTENT，再修改一个真实小项目；沿用既有实现，测试通过，提交带代码范围和实际证据的 Review。工具调用与源码 diff 均留证。
5. 两个 Codex 会话各自处理不重叠任务，重叠认领被拒绝；租约过期后旧 token 无效；工作区隔离与共用协作状态有证据。
6. 人类审阅看到实际 diff/源码、风险标记和证据来源；Agent 无批准入口；源码改变后旧验收失败。批准只在隔离测试项目演练，真实项目保持待用户决定。
7. 增量索引不在每两秒完整重读所有文件；变更可刷新、删除可清除、Git ignore/软链接/秘密文件边界不退化。测量真实扫描与局部修改，不用无关微基准。
8. 记录可导出，导入有校验、重复/冲突可见，不传播租约或批准身份；旧本地数据库与标签迁移保留用户内容。
9. 桌面1440×960、笔记本1280×800、窄屏390×844检查：布局无整页横溢、文字可读、主要路径触达、键盘焦点、空/错/等待/冲突状态正确。视觉检查以真实截图为准。
10. 严格TypeScript通过；生产构建与VSIX包内独立运行通过；保留行为回归测试，避免测试函数名/源码字符串代替真实行为。不用 @ts-nocheck 或全局关闭 strict 伪装迁移。

## 结构与共享协议

- `src/*.ts`：迁移旧插件，保留既有高亮与任务能力；新 bridge 仍为按需启动。esbuild 替代旧 Webpack 发布构建。
- `packages/shared/src/types.ts`：统一领域契约，由主线程拥有，修改先回报需要的 delta。
- `packages/core/src/**`：严格 TS 的源码索引、存储、注释、任务与 Review 服务；复用注释语法，拆开职责，不再一个巨型 dispatch 文件。
- `apps/server/src/**`, `apps/mcp/src/**`, `apps/cli/src/**`：薄协议适配层，统一验证与权限，由主线程负责。
- `apps/web/**`：React + TypeScript + Vite + React Flow + ELK + Lucide，真实 API。
- 编译输出保留 `workspace/core/index.mjs`、`workspace/server.mjs`、`workspace/mcp.bundle.mjs`、`workspace/cli.mjs` 路径作为生成物；不维护平行旧实现。Web构建到 `workspace/public`。

共享契约在 `packages/shared/src/types.ts`。`createWorkspace(root, options)` 返回泛型 `dispatch(operation,args,actor)` 与 close。SQLite现有records/events/scans继续兼容，升级幂等。所有读写错误包含code/message。新增 Review baseline 必须覆盖完整 task.paths；review_detail返回真实before/after且显式说明无历史baseline的旧记录。

HTTP兼容：GET /api/bootstrap->{token,snapshot}; /api/snapshot、/api/source?path、/api/updates?after、/api/export、/api/reviews/:id；POST /api/operation {operation,args}，X-TaskVision-Token，服务注入human身份。新增 annotation_decide / knowledge_import human-only。MCP始终agent身份，不提供任何人工批准入口。不得绕过旧安全检查。API错误翻译为可操作中文，保留code。

## 明确分工

- Extension worker：`src/**`, `test/**`, `tsconfig.extension.json`。只迁移插件与旧测试；不要写packages/apps/package.json/治理文件。
- Core worker：`packages/core/**`, `workspace/test/core*.test.mjs`, `workspace/test/safety*.test.mjs`。只实现统一core和行为测试；不要写src/apps/共享契约/清单。
- Frontend worker：`apps/web/**`。只写界面、视觉设计与组件；不要改协议/server/core/清单。
- Main：共享契约、依赖/构建、HTTP/MCP/CLI、实际Codex与浏览器验收、集成、文档、提交。

## 工作约定

本次用户授权已覆盖架构/依赖重构，无需再次询问。先复用已有行为，再修复真实体验缺口。不要为了测试数量写断言；每条重要测试对应上面的用户风险。禁止降低测试门槛、写空壳、使用全局any/ts-nocheck掩盖类型错误。不要启动嵌套Agent、使用其他项目或修改全局配置。不要删除别人的改动；不git reset/checkout/commit/push。每个worker输出实际完成、验证、风险和下一步。独立审查由主线程随后安排，不自称已完成。
