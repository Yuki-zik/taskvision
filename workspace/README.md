# TaskVision Knowledge Workspace · 2.1.0 本地预览

本次重构保留原 VS Code 高亮、任务树和上下文导出，在它们旁边增加一个共享知识与协作核心。网页、MCP、CLI 读取同一份源码标记与项目知识。当前是可运行的本地预览，尚未发布 Marketplace。

## 运行与安装

开发环境需要 Node.js **22.18+**。Node 22 的 `node:sqlite` 会输出实验性提示；提示位于 stderr，不污染 MCP JSON-RPC。

```sh
cd /path/to/taskvision
npm ci
npm run workspace:install
npm run workspace:start
```

默认浏览器地址 `http://127.0.0.1:4317/`。指定其他工程：

```sh
node workspace/server.mjs --root /path/to/your-project --port 4317
```

VS Code 中运行 **TaskVision: Open Knowledge Workspace / 打开项目知识工作台**。命令使用外部 Node 子进程，自动挑选空闲端口；插件启动时不会自动运行服务。结束时运行 **Stop Knowledge Workspace**。工作区不受信任时拒绝启动。Mac 图形环境找不到 Node 时，在**用户设置**中配置：

```json
{"taskvision.workspace.nodePath":"/opt/homebrew/opt/node@22/bin/node"}
```

此设置只采用用户／机器配置，忽略仓库覆盖。原有自定义标签列表不会被强制替换；运行 **Enable Knowledge Tags** 可追加四个标签。

```sh
npm run package:preview
```

输出 `artifacts/taskvision-2.1.0-preview.vsix`。预览打包明确使用仓库已跟踪的 codicon 名单，以避免网络变化影响结果；普通 `vscode:prepublish` 仍刷新上游名单，失败会终止构建。打包包含压缩后的 MCP 运行时，无需在安装目录执行 npm install。

## 四条知识流与协作

```js
// CORE: 项目的训练入口 [tv:id=core.train]
// REUSE: 新算法通过 training_step 扩展已有循环
// INTENT: 保留优化器状态与 RNG 恢复契约
// REVIEW: 请检查负数量化的舍入边界
```

新标签复用现有 `annotationParser`、高亮与任务树：CORE→entrypoint，REUSE→reusable，INTENT→constraint，REVIEW→verify。显式 `tv:` 指令优先，普通 TODO 行为不变。

Web 提供目录结构地图、语义索引、源码行预览与标注高亮、共享指导编辑、协作任务和人工审阅队列。当前支持文件／项目级知识；模块级开发范围通过任务 paths 表达。网页对源码的编辑只允许修改选中注释的正文，保留标签、指令和行尾格式；没有任意文件写入入口。

通过网页新增的指导写入共享知识库，Agent 下一次查询即可看到。直接修改源码注释后，下一次索引读取会更新结果；网页可见时约每两秒刷新。双窗口编辑同一知识使用 expectedRevision，源码编辑使用 SHA-256，过期写入返回冲突，不静默覆盖。

## MCP 与 Skill

在插件命令面板执行 **Copy Agent MCP Configuration**，复制适合当前工程的配置；不会自动修改全局 Agent 设置。源码开发环境的配置示例：

```json
{
  "mcpServers": {
    "taskvision": {
      "command": "/opt/homebrew/opt/node@22/bin/node",
      "args": ["/path/to/taskvision/workspace/mcp.mjs", "--root", "/path/to/project"]
    }
  }
}
```

VSIX 安装后的运行入口使用同目录 `mcp.bundle.mjs`。每个 worktree 的 MCP 进程应指向自己的根目录；Git common directory 中的数据库让这些进程共享协调状态。

10 个工具：`taskvision_snapshot`、`taskvision_context`、`taskvision_source`、`taskvision_annotation_upsert`、`taskvision_task_create`、`taskvision_task_claim`、`taskvision_task_heartbeat`、`taskvision_task_release`、`taskvision_review_submit`、`taskvision_updates`。另提供只读资源 `taskvision://project`。

专属 Skill 位于 `skills/taskvision-workspace/SKILL.md`。它要求在开始任务、修改共享接口前、进入下一阶段以及 Review 交接前读取新指导；先检索可复用实现，再认领范围，最后交付证据。MCP 数据更新不保证主动中断模型，检查点需要 Agent 宿主遵循。

CLI 可用于排查或未接 MCP 的 Agent：

```sh
node workspace/cli.mjs --root /path/to/project snapshot
node workspace/cli.mjs --root /path/to/project context '{"tag":"REUSE","query":"checkpoint"}'
node workspace/cli.mjs --root /path/to/project updates '{"after":12}'
node workspace/cli.mjs --root /path/to/project export > knowledge-export.json
```

## 多 Agent 与人工验收

任务必须声明具体文件或目录。任务认领在 SQLite `BEGIN IMMEDIATE` 事务中处理：已有有效认领、重叠范围、未完成前置依赖都会拒绝。租约有到期时间与随机 fencing token；续租、释放、提交 Review 要携带有效 token，过期 token 不得重新生效。公共快照不返回 token。

Agent 的知识写入为 `proposed`，不能覆盖已确认的人类指导。Review 记录绑定工作区、Git HEAD 和范围内全部可读源码哈希。人工接受时重新核对；文件改变、缺失、扫描被截断或切换 worktree 时拒绝验收。测试证据只是 Agent 提供的文本，服务不声称其已经执行或验证。MCP／CLI 不提供人工批准工具。

范围租约属于协作约定，外部 shell 仍能改文件。应用角色同样无法隔离拥有同一操作系统账户和文件权限的任意 Agent。此版本不管理 Agent 进程、自动创建 worktree、执行仓库脚本、自动合并或推送。

## 数据与权限

- 源码注释保留在源文件里，随 Git 版本化；索引不会擅自补 ID。
- Git 项目的知识、任务、租约、Review 和事件存储在 `git rev-parse --git-common-dir` 下的 `taskvision/workspace.sqlite`。非 Git 项目使用 `.taskvision/workspace.sqlite`。
- Web 知识与协作状态不会自动进入 Git、跨机器同步或推送到远端。需要可移交副本时显式导出 JSON。当前尚无导入／自动合并机制。
- 旧 `.taskvision/context-index.json` 只读导入，标为待复核历史知识；不会覆盖旧 sidecar 或复用其进程内缓存。
- HTTP 只监听 `127.0.0.1`，校验 Host／Origin；写入需要同源会话 token。禁止任意跨源访问，限制请求大小，使用 CSP。token 用于防止跨站请求，不是面向互联网的身份认证。
- 源码接口拒绝路径穿越、软链接、已知敏感文件、生成目录和超大／二进制文件。该规则不等同于自动发现所有秘密内容。

## 目前明确的限制

结构图使用目录与轻量词法 import／symbol 分析，无法保证完整调用关系。源码标记支持独立注释行；复杂语法、嵌入式语言和全部行尾注释尚未覆盖。没有 embedding 检索或完整 LSP 集成。

带 `tv:id` 的注释可保留内容编辑后的身份；跨文件重构、任意符号重命名和无 ID 注释重写没有完整的锚点迁移保证。源码指纹变化会使相关 Web 知识过时，仍需人工判断实际影响。

默认最多扫描 2,000 个文件，单文件 512 KiB；超限会明确标记，Review 不接受不完整扫描。大型仓库的增量性能、多平台真实 Extension Host 和长时间并发压力仍需进一步验证。

## 验证

```sh
npm test                  # 旧插件回归与新标签／桥接测试
npm run webpack           # 原有扩展构建
npm run workspace:test    # 核心、真实 MCP、HTTP、安全和进程并发测试
npm run package:preview   # 本地 VSIX，不发布
```

验收覆盖真实 MCP initialize／tools/list／tools/call、Web→Agent 指导同步、过期写入、独立进程抢占、worktree 共享、lease fencing、人工批准权限、Review 指纹变化、路径逃逸与跨源请求等。浏览器测试在隔离 fixture 上执行人工批准，真实项目的交付仍等待用户 Review。
