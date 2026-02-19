# Deploying TaskVision to VS Code Marketplace

This guide details how to package and publish the TaskVision extension to the Visual Studio Code Marketplace.

## Prerequisites

1.  **Node.js**: Ensure Node.js is installed.
2.  **vsce**: Install the VS Code Extension Manager globally:
    ```bash
    npm install -g @vscode/vsce
    ```
3.  **Azure DevOps Organization**:
    -   Go to [Azure DevOps](https://dev.azure.com/) and create an organization if you don't have one.
4.  **Personal Access Token (PAT)**:
    -   In Azure DevOps, go to **User Settings** -> **Personal Access Tokens**.
    -   Create a new token with:
        -   **Organization**: "All accessible organizations"
        -   **Scopes**: "Marketplace" -> "Acquire" and "Manage" (or "All scopes").
    -   **Copy this token**, you won't see it again!
5.  **Publisher Account**:
    -   Go to the [VS Code Marketplace Management Portal](https://marketplace.visualstudio.com/manage).
    -   Create a publisher.
    -   **Important**: The publisher ID usually needs to match the `publisher` field in your `package.json` (currently `Yuki-zik`).

## Deployment Steps

### 1. Login
Open your terminal and log in using `vsce`. You will be prompted for your Personal Access Token (PAT).

```bash
vsce login Yuki-zik
```

### 2. Package (Optional but Recommended)
Before publishing, it's good practice to package the extension into a `.vsix` file to test it locally or inspect the contents.

```bash
vsce package
```
This generates a `taskvision-x.x.x.vsix` file. You can install this manually in VS Code (Extensions view -> "..." -> "Install from VSIX...") to verify everything works.

### 3. Publish
To publish the extension to the marketplace:

```bash
vsce publish
```
This will:
1.  Run the `vscode:prepublish` script (which runs webpack to build the code).
2.  Upload the package to the marketplace.

### 4. Updating Versions
When releasing a new version, update the version number in `package.json` first:

```bash
npm version patch  # For bug fixes (1.0.0 -> 1.0.1)
npm version minor  # For new features (1.0.0 -> 1.1.0)
npm version major  # For breaking changes (1.0.0 -> 2.0.0)
```
Then run `vsce publish` again.

## Common Issues
-   **Publisher verification**: Ensure you have verified your domain if required by the marketplace.
-   **Icon missing**: Ensure `resources/todo-tree.png` exists.
-   **Token expired**: If `vsce publish` fails with authentication errors, create a new PAT and login again.

---

# 部署 TaskVision 到 VS Code 插件市场

本指南详细说明了如何打包并将 TaskVision 扩展发布到 Visual Studio Code 市场。

## 准备工作

1.  **Node.js**: 确保已安装 Node.js。
2.  **vsce**: 全局安装 VS Code 扩展管理器：
    ```bash
    npm install -g @vscode/vsce
    ```
3.  **Azure DevOps 组织**:
    -   前往 [Azure DevOps](https://dev.azure.com/)，如果没有组织则创建一个。
4.  **个人访问令牌 (PAT)**:
    -   在 Azure DevOps 中，前往 **User Settings** -> **Personal Access Tokens**。
    -   创建一个新令牌，设置如下：
        -   **Organization**: "All accessible organizations"
        -   **Scopes**: "Marketplace" -> "Acquire" 和 "Manage"（或者直接选 "All scopes"）。
    -   **复制这个令牌**，之后无法再次查看！
5.  **发布者账号**:
    -   前往 [VS Code 市场管理门户](https://marketplace.visualstudio.com/manage)。
    -   创建一个发布者 (Publisher)。
    -   **重要**: 发布者 ID 必须与 `package.json` 中的 `publisher` 字段一致（当前为 `Yuki-zik`）。

## 部署步骤

### 1. 登录
打开终端，使用 `vsce` 登录。系统会提示输入您的个人访问令牌 (PAT)。

```bash
vsce login Yuki-zik
```

### 2. 打包 (可选但推荐)
在发布之前，建议先将扩展打包为 `.vsix` 文件，以便在本地测试或检查内容。

```bash
vsce package
```
这将生成一个 `taskvision-x.x.x.vsix` 文件。您可以在 VS Code 中手动安装此文件（扩展视图 -> "..." -> "从 VSIX 安装..."）以验证功能是否正常。

### 3. 发布
将扩展发布到市场：

```bash
vsce publish
```
此命令将：
1.  运行 `vscode:prepublish` 脚本（执行 webpack 构建代码）。
2.  将包上传到市场。

### 4. 更新版本
发布新版本时，请先更新 `package.json` 中的版本号：

```bash
npm version patch  # 用于修复 bug (1.0.0 -> 1.0.1)
npm version minor  # 用于新功能 (1.0.0 -> 1.1.0)
npm version major  # 用于重大变更 (1.0.0 -> 2.0.0)
```
然后再次运行 `vsce publish`。

## 常见问题
-   **发布者验证**: 确保您已按市场要求验证了域名（如需）。
-   **图标丢失**: 确保 `resources/todo-tree.png` 存在。
-   **令牌过期**: 如果 `vsce publish` 因认证错误失败，请创建新的 PAT 并重新登录。
