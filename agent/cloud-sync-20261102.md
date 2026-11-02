# TaskVision 3.8.2 云端检查点

日期：2026-11-02（Asia/Shanghai）。状态：**源码已同步，可独立恢复，三平台 CI 通过。**

## 源码基线

- 既有云端仓库：[Yuki-zik/taskvision](https://github.com/Yuki-zik/taskvision)，公开仓库，默认分支 `master`。
- 同步前云端：`e4c923c9754c139660118ad229a7c92ec9412113`，2.0.1。
- 最新功能源码：`520362443887d9a4562c0a753691d1595b8dd98e`，3.8.2 Preview，2026-10-28。
- 该功能源码线性领先原云端 13 个提交；完整保留原有提交历史。
- 当前已验证源码：[b402f61](https://github.com/Yuki-zik/taskvision/commit/b402f6173961991eb8d2be3fa9bcc2c9c01b12fa)。后续回执提交仅更新进度与校验清单。
- 同步工作在独立 worktree 完成，原开发目录及其用户生成报告保持原样。

## 已实现的能力

| 领域 | 当前内容 |
|---|---|
| 工程底座 | 严格 TypeScript；VS Code、Web、MCP、CLI 共用类型与领域逻辑 |
| 源码关系图 | 源码支持的依赖、语义标签、影响分析、Graph Studio 与节点详情 |
| 个人工作台 | 显式登记工程、多项目隔离切换、明暗主题、布局与源码高亮 |
| 人机协作 | 源码锚定指导、知识索引、范围租约、Review 差异及人工验收 |
| 原生体验 | 霓虹与玻璃高亮、三步入门、任务与知识侧栏、中英设置和常用菜单 |
| 3.8.1 修复 | 同一文件不同行的新指导草稿隔离，兼容旧草稿 |

最近功能开发时间为 10 月 28 日；11 月 2 日处理源码同步、进度整理和可复现性验证，不将其表述为新的功能版本。

## 验证

- 历史 3.8.2 验收：188 原生 QUnit、64 Core/HTTP/MCP、107 Web、10 Chrome workflows、TypeScript、格式、生产构建与 VSIX 资源核验通过；详见 [native-usability-acceptance.md](native-usability-acceptance.md)。
- 本次独立 worktree：锁文件安装、TypeScript、格式、生产构建通过；188/188 原生、64/64 Core/HTTP/MCP、107/107 Web 与 10/10 Chrome workflows 通过。环境：macOS 26.3.1 / arm64，Node.js 22.22.0，npm 10.9.4。
- 首次干净工作区的两项 bridge 测试依赖仓库里预先生成的 `workspace/server.mjs`。修复仅在测试中创建独立临时运行文件夹具，保留全部原断言；真实运行时代码与构建流程不变。确认仓库中仍无生成文件时，`npm run test:legacy` 188/188 通过。
- 首轮浏览器用例有一项在 `afterEach` 等待服务器关闭时超时，功能断言已完成。先关闭测试浏览器连接、再关闭服务器后，10/10 全部通过；未加大超时、未减少断言、未启用重试。
- 出站 13 个提交的 489 个新增 Git blob 已检查，凭证模式与敏感文件名未命中；没有本地/私有路径锁文件依赖、子模块、LFS 对象或新增超过 5 MiB 的 blob。四个旧 `.taskvision/` 文件的 Git blob 与原云端基线完全相同。
- [源码检查点 `255a8c0`](https://github.com/Yuki-zik/taskvision/commit/255a8c03edf8bbd0e5714b1c2c7ab383e586ac3d) 已推送并读回。全新网络克隆的 282 个文件 SHA-256 匹配；锁文件安装、188/188 干净原生测试、预发布包构建和 3/3 HTTP/MCP 实测通过。
- 重建 VSIX：108 个条目，41 个运行文件与构建输出逐字节一致。
- [第一轮 CI](https://github.com/Yuki-zik/taskvision/actions/runs/41428422478)：macOS、Ubuntu 全流程通过；Windows 187/188，一条测试将原生路径误断言为 POSIX 分隔符。测试改为 `path.join` 和 `path.sep`，业务路径实现原已正确。
- [最终源码 CI](https://github.com/Yuki-zik/taskvision/actions/runs/41428857128)：Windows、macOS、Ubuntu 均通过安装、TypeScript、原生/Web 测试和生产构建；macOS/Ubuntu 通过 filesystem/MCP integration，Windows 按既有工作流跳过该步。
- 恢复目录已从远端取得 `b402f61`，其 282 个源码文件经 Git blob/SHA-256 校验一致；修正的测试 6/6 通过。与已独立打包的 `255a8c0` 相比，全部打包输入无变化，因此该安装包及 3/3 transport 证据继续适用。

## 保留的验收边界

真实中文图形 Extension Host 尚未通过：此前安装中文语言包后，测试宿主仍报告 `en`。模拟中文宿主与 NLS 完整性已验证。80 项高级设置仍存在，少量低频旧对话框保留英文。跨平台图形宿主、大规模长期运行和全部主题的逐像素一致性均未得到本检查点证明。

## 复现方法

要求 Node.js 22.18+ 与 npm；锁文件为根目录 `package-lock.json`。

```sh
git clone https://github.com/Yuki-zik/taskvision.git
cd taskvision
git checkout b402f6173961991eb8d2be3fa9bcc2c9c01b12fa
npm ci
npm run typecheck
npm test
npm run format:check
npm run build:production
npm run package:preview -- artifacts/taskvision-3.8.2-preview.vsix
```

`package:preview` 显式指定 3.8.2 文件名：现有脚本的默认文件名仍为 `taskvision-3.8.0-preview.vsix`，包内版本来自 `package.json`。复用原脚本，不更改构建或发布流程。浏览器流程使用本地 Chrome，可运行 `npm run test:e2e -- tests/e2e/workflows.spec.ts`。

## 覆盖与排除

包括源码、锁文件、构建脚本、测试、许可证、既有开发历史和经过整理的验收说明。`.taskvision/` 已在忽略规则内；本次取消跟踪四个历史生成文件，原开发目录的数据仍保留。运行数据库、租约凭证、私有偏好、原始执行日志和预编译安装包不进入源码检查点；安装包可以按上述命令重建。既有历史提交不做擦除或改写。

本次目标是既有 GitHub 仓库的源码与进度统一，不发布 Marketplace，不更换日常 VS Code 插件，不改变仓库可见性。

## 恢复凭据

- [282 个源码文件的大小、Git blob 与 SHA-256 清单](checkpoints/taskvision-3.8.2-20261102.source.json)。清单固定到 `b402f61`，不包含后续回执本身。
- [远端恢复与验收回执](checkpoints/taskvision-3.8.2-20261102.restore.json)，记录精确源码版本、验证环境、命令阶段、安装包审计及 CI。
- 独立重建的 3.8.2 VSIX：3,185,049 字节；SHA-256 `3942efb44f7036122cd3184dd369671f59a1595812f7665d28e78625a550bd3b`。该哈希标识本次重建产物；历史 10 月 28 日安装包的文档内容和归档元数据不同，不要求整个 VSIX 跨构建逐字节相同。
