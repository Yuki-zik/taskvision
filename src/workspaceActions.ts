import type { ExtensionContext, QuickPickItem } from 'vscode';

interface WorkspaceAction extends QuickPickItem {
    command?: string;
    query?: string;
}

const SETTINGS_QUERY = '@ext:a-znk.taskvision';

// REUSE: Dispatch to the original task tree, appearance and workspace commands.
// Browsing or cancelling this picker must never rewrite a user's settings.
export function registerWorkspaceActions(vscode: typeof import('vscode'), context: ExtensionContext): void {
    const chinese = /^zh/i.test(vscode.env.language || '');
    const text = (en: string, zh: string) => chinese ? zh : en;
    const separator = (en: string, zh: string): WorkspaceAction => ({
        label: text(en, zh), kind: vscode.QuickPickItemKind.Separator,
    });
    const action = (command: string, icon: string, en: string, zh: string, detailEn: string, detailZh: string): WorkspaceAction => ({
        label: '$(' + icon + ') ' + text(en, zh),
        detail: text(detailEn, detailZh), command: 'taskvision.' + command,
    });
    const settings = (prefix: string, en: string, zh: string, detailEn: string, detailZh: string): WorkspaceAction => ({
        label: '$(settings-gear) ' + text(en, zh), detail: text(detailEn, detailZh),
        command: 'workbench.action.openSettings', query: SETTINGS_QUERY + ' ' + prefix,
    });

    async function dispatch(selected?: WorkspaceAction) {
        if (!selected?.command) return;
        return selected.query
            ? vscode.commands.executeCommand(selected.command, selected.query)
            : vscode.commands.executeCommand(selected.command);
    }

    async function gettingStarted() {
        // A short, optional route through existing commands. Never mutate settings
        // or add source comments merely by opening/cancelling this guide.
        const steps: WorkspaceAction[] = [
            action('refresh', 'search', '1. Read source tags', '1. 阅读源码标签',
                'Add // INTENT: why or // TODO [todo] task to code, then refresh the task tree.',
                '在源码注释中添加 // INTENT: 原因 或 // TODO [todo] 任务，再刷新任务树。'),
            action('openWorkspace', 'type-hierarchy', '2. Open the Knowledge Workspace', '2. 打开项目知识工作台',
                'Browse architecture, source evidence, guidance and human reviews; requires Node.js 22.18+.',
                '查看架构、源码证据、人工指导与审阅；需要 Node.js 22.18+。'),
            action('copyMcpConfig', 'copy', '3. Connect your coding Agent', '3. 连接编程 Agent',
                'Copy the project-scoped MCP configuration; paste it into your Agent client yourself.',
                '复制当前项目的 MCP 配置，然后手动粘贴到 Agent 客户端。'),
            settings('taskvision.workspace', 'Node.js setup and troubleshooting', 'Node.js 配置与排障',
                'Only needed if Node.js 22.18+ is not already available on PATH.',
                '只有 PATH 中无法找到 Node.js 22.18+ 时才需要调整。'),
        ];
        return dispatch(await vscode.window.showQuickPick(steps, {
            title: text('TaskVision: Getting Started', 'TaskVision：新手入门'),
            placeHolder: text('Choose a step; Escape makes no changes', '选择一步操作；按 Escape 直接关闭，不会更改设置'),
            matchOnDescription: true, matchOnDetail: true,
        }));
    }

    async function quickActions() {
        const items: WorkspaceAction[] = [
            separator('Start here', '从这里开始'),
            action('openWorkspace', 'type-hierarchy', 'Open Knowledge Workspace', '打开项目知识工作台',
                'Open this project’s architecture, source evidence and Review in your browser.', '在浏览器中打开项目架构、源码证据和 Review。'),
            action('gettingStarted', 'book', 'Getting Started (3 Steps)', '新手入门（三步上手）',
                'Start with source tags, open the project, then connect your Agent.',
                '从源码标签开始，打开项目工作台，再按需连接编程 Agent。'),
            separator('Workspace', '项目工作台'),
            action('refresh', 'refresh', 'Refresh Tasks and Highlights', '刷新任务与高亮',
                'Rescan with your current scan mode, tags and filters.', '按当前扫描模式、标签和筛选条件重新扫描。'),
            action('stopWorkspace', 'debug-stop', 'Stop Knowledge Workspace', '停止项目知识工作台',
                'Stop the local services started by this extension.', '停止由当前插件启动的本地服务。'),
            settings('taskvision.workspace', 'Workspace Runtime Settings', '工作台运行设置',
                'Set Node.js 22.18+ if it is not available on PATH; most users can keep the default.',
                '仅当 PATH 中找不到 Node.js 22.18+ 时才需设置路径，其他情况保留默认值。'),

            separator('Appearance and tags', '外观与标签'),
            action('enableKnowledgeTags', 'tag', 'Enable Knowledge Tags', '启用知识标签',
                'Add CORE, REUSE, INTENT and REVIEW; preserve existing custom tags.', '添加 CORE、REUSE、INTENT、REVIEW，保留已有自定义标签。'),
            action('setHighlightSchemeForAllTags', 'symbol-color', 'Change Tag Highlight Scheme…', '更改标签高亮方案…',
                'Choose Neon, Glass, both or none using the original scheme picker.', '通过原有方案选择器选择霓虹、玻璃、两者或无效果。'),
            settings('taskvision.highlights', 'Highlight Channel Settings', '高亮通道设置',
                'Configure independent color, glow, glass and font scopes and custom tag styles.', '配置文字颜色、辉光、玻璃、字体的独立范围及自定义标签样式。'),

            separator('Tasks', '任务'),
            action('filter', 'filter', 'Filter Task Tree…', '筛选任务树…',
                'Filter the original tree by text or tag.', '按文本或标签筛选原有任务树。'),
            action('filterByStatus', 'checklist', 'Filter Tasks by Status…', '按状态筛选任务…',
                'Choose todo, doing, blocked, review or other task states.', '选择 todo、doing、blocked、review 等任务状态。'),
            action('resetAllFilters', 'clear-all', 'Clear All Task Filters', '清除全部任务筛选',
                'Show tasks hidden by text, status or folder filters.', '显示被文本、状态或文件夹条件隐藏的任务。'),
            settings('taskvision.tree', 'Task Tree and Badge Settings', '任务树与徽标设置',
                'Configure scan mode, grouping, counts and Activity Bar badges.', '配置扫描模式、分组、计数和活动栏徽标。'),

            separator('AI context and settings', 'AI 上下文与设置'),
            action('exportAiContext', 'export', 'Export AI Context', '导出 AI 上下文',
                'Export real tasks and annotations using the existing context exporter.', '使用原有导出功能生成真实任务与注释的上下文。'),
            action('openAiStatusReport', 'report', 'Open AI Status Report', '打开 AI 状态报告',
                'Open this project’s existing TaskVision report.', '打开当前项目已有的 TaskVision 报告。'),
            action('copyMcpConfig', 'copy', 'Copy Agent MCP Configuration', '复制 Agent MCP 配置',
                'Copy project-scoped MCP configuration to the clipboard.', '将当前项目的 MCP 配置复制到剪贴板。'),
            action('configureAppearanceAndWorkspace', 'settings-gear', 'Open TaskVision Settings', '打开 TaskVision 设置',
                'Open all TaskVision options in native VS Code Settings.', '在 VS Code 原生设置中查看 TaskVision 的全部选项。'),
        ];
        const selected = await vscode.window.showQuickPick(items, {
            title: text('TaskVision: Quick Actions', 'TaskVision：快捷操作'),
            placeHolder: text('Choose an action or search tasks, highlights, workspace, MCP and settings', '选择操作，或搜索任务、高亮、工作台、MCP 和设置'),
            matchOnDescription: true, matchOnDetail: true,
        });
        return dispatch(selected);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('taskvision.gettingStarted', gettingStarted),
        vscode.commands.registerCommand('taskvision.quickActions', quickActions),
        vscode.commands.registerCommand('taskvision.configureAppearanceAndWorkspace', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS_QUERY)),
    );
}
