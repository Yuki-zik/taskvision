import {isTaskAnnotationNode, isContextAnnotationNode, isReviewAnnotationNode, deriveStableIdForNode, buildDirectivePatchForNode, collectReferencedStableIds, shouldEnsureStableIdForNode, getSyncNodesForRoot as selectSyncNodesForRoot} from './annotationPolicy';
import type {SyncOptions} from './annotationPolicy';
import type {TreeNode, TodoNode, ContextCard, ChangeSession} from './model';
import {present, strings, errorMessage} from './validation';
// CORE: VS Code 入口：注册扫描、任务树、注释同步与工作台命令。 [tv:id=core.extension]

import * as vscode from 'vscode';
import * as ripgrep from './ripgrep';
import * as path from 'path';
import * as treeify from 'treeify';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as child_process from 'child_process';

import * as tree from './tree.js';
import * as colours from './colours.js';
import * as icons from './icons.js';
import * as highlights from './highlights.js';
import * as config from './config.js';
import * as utils from './utils.js';
import * as attributes from './attributes.js';
import * as searchResults from './searchResults.js';
import * as settingsMigration from './settingsMigration.js';
import * as taskState from './taskState.js';
import * as taskMetaStore from './taskMetaStore.js';
import * as contextStore from './contextStore.js';
import * as changeSessionStore from './changeSessionStore.js';
import * as annotationParser from './annotationParser.js';
import * as aiContext from './aiContext.js';
import {registerAppearanceCommands} from './commands/appearance';
import * as knowledgeWorkspace from './knowledgeWorkspace.js';

let searchList: string[] = [];
let currentFilter: string | undefined;
let currentStatusFilter: string[] | undefined;
let interrupted = false;
let selectedDocument: string | undefined;
let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
let fileRefreshTimeout: ReturnType<typeof setTimeout> | undefined;
let hideTimeout: ReturnType<typeof setTimeout> | undefined;
let autoGitRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let periodicRefreshTimer: ReturnType<typeof setTimeout> | undefined;
const lastGitHead: Record<string, string> = {};
const openDocuments: Record<string, vscode.TextDocument> = {};
let provider: tree.TreeNodeProvider;
let ignoreMarkdownUpdate = false;
let markdownUpdatePopupOpen = false;

const SCAN_MODE_WORKSPACE_AND_OPEN_FILES = 'workspace';
const SCAN_MODE_OPEN_FILES = 'open files';
const SCAN_MODE_CURRENT_FILE = 'current file';
const SCAN_MODE_WORKSPACE_ONLY = 'workspace only';

const STATUS_BAR_TOTAL = 'total';
const STATUS_BAR_TAGS = 'tags';
const STATUS_BAR_TOP_THREE = 'top three';
const STATUS_BAR_CURRENT_FILE = 'current file';

const MORE_INFO_BUTTON = "More Info";
const YES_BUTTON = "Yes";
const NEVER_SHOW_AGAIN_BUTTON = "Never Show This Again";
const OPEN_SETTINGS_BUTTON = "Open Settings";
const OK_BUTTON = "OK";

// Display-only localization; internal task statuses, priorities and source
// comment tokens stay English so Agent contracts and existing code remain stable.
const nativeText = (en: string, zh: string): string =>
    /^zh(?:[-_]|$)/i.test(vscode.env.language || '') ? zh : en;
const statusZh: Record<string, {name: string; detail: string}> = {
    todo: {name: '待办', detail: '尚未开始、需要处理的工作'},
    doing: {name: '进行中', detail: '正在处理的工作'},
    blocked: {name: '阻塞', detail: '任务阻塞：等待依赖或问题解决后才能继续'},
    paused: {name: '暂停', detail: '主动推迟到以后处理'},
    review: {name: '待审阅', detail: '已实现或调查完成，等待人工确认'},
    done: {name: '已完成', detail: '已完成的工作'},
    wontdo: {name: '不处理', detail: '已明确决定不再处理'},
    idea: {name: '想法', detail: '尚未确定实施的观察或想法'},
};
const priorityZh: Record<string, {name: string; detail: string}> = {
    critical: {name: '紧急', detail: '阻塞发布或紧急生产问题'},
    high: {name: '高', detail: '重要且应尽快处理'},
    normal: {name: '普通', detail: '默认优先级'},
    low: {name: '低', detail: '有用但不紧急'},
    trivial: {name: '很低', detail: '锦上添花或清理工作'},
};
const statusTitle = (key: string): string =>
    nativeText(key, key + ' · ' + (statusZh[key]?.name || key));
const statusDetail = (key: string, english: string): string =>
    nativeText(english, statusZh[key]?.detail || english);
const priorityTitle = (key: string): string =>
    nativeText(key, key + ' · ' + (priorityZh[key]?.name || key));
const priorityDetail = (key: string): string =>
    nativeText(taskState.getPriorityDescription(key), priorityZh[key]?.detail || key);

function toEditorSearchResult(match: ripgrep.Match, uri: vscode.Uri): import('./model').SearchResult {
    return {...match, uri, extraLines: match.extraLines?.map(line => toEditorSearchResult(line, uri))};
}

function activate(context: vscode.ExtensionContext) {
    let outputChannel: vscode.OutputChannel | undefined;
    let bufferTruncationWarningShown = false;

    function settingLocation(setting: string) {
        const current = vscode.workspace.getConfiguration('taskvision').inspect(setting);
        if (current?.workspaceFolderValue !== undefined) {
            return vscode.ConfigurationTarget.WorkspaceFolder;
        }
        else if (current?.workspaceValue !== undefined) {
            return vscode.ConfigurationTarget.Workspace;
        }
        return vscode.ConfigurationTarget.Global;
    }

    function debug(text: string) {
        if (outputChannel) {
            const now = new Date();
            outputChannel.appendLine(now.toLocaleTimeString('en', { hour12: false }) + "." + String(now.getMilliseconds()).padStart(3, '0') + " " + text);
        }
    }

    let buildCounter = context.workspaceState.get('buildCounter', 1);
    context.workspaceState.update('buildCounter', ++buildCounter);

    currentFilter = context.workspaceState.get('currentFilter');
    currentStatusFilter = (context.workspaceState.get<string[]>('currentStatusFilter') || []).map(function (status) {
        return taskState.normaliseStatus(status);
    }).filter(present);
    if (currentStatusFilter.length === 0) {
        currentStatusFilter = undefined;
    }

    config.init(context);
    knowledgeWorkspace.register(vscode, context);
    highlights.init(context, debug);
    utils.init(config);
    attributes.init(config);

    provider = new tree.TreeNodeProvider(context, debug, setButtonsAndContext);
    const statusBarIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

    const todoTreeView = vscode.window.createTreeView("taskvision-view", { treeDataProvider: provider });

    context.subscriptions.push(provider);
    context.subscriptions.push(statusBarIndicator);
    context.subscriptions.push(todoTreeView);

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('todotree-export', {
        provideTextDocumentContent(uri) {
            if (path.extname(uri.path) === '.json') {
                return JSON.stringify(provider.exportTree(), null, 2);
            }
            return treeify.asTree(provider.exportTree(), true);
        }
    }));

    ignoreMarkdownUpdate = context.globalState.get('ignoreMarkdownUpdate', false);

    function resetOutputChannel() {
        if (outputChannel) {
            outputChannel.dispose();
            outputChannel = undefined;
        }
        if (vscode.workspace.getConfiguration('taskvision.general').get<boolean>('debug')! === true) {
            outputChannel = vscode.window.createOutputChannel("TaskVision");
        }
    }

    function refreshTree() {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(function () {
            provider.refresh();
            updateInformation();
            setButtonsAndContext();
        }, 200);
    }

    function addResultsToTree() {
        if (searchResults.containsMarkdown()) {
            checkForMarkdownUpgrade();
        }

        searchResults.addToTree(provider);

        if (interrupted === false) {
            updateInformation();
        }

        provider.filter(currentFilter);
        provider.filterByStatus(currentStatusFilter);
        refreshAiStatusReports();
        refreshTree();
    }

    function updateInformation() {
        const statusBar = vscode.workspace.getConfiguration('taskvision.general').get<string>('statusBar')!;

        let counts = provider.getTagCountsForActivityBar();
        let total = Object.values(counts).reduce(function (a, b) { return a + b; }, 0);

        const badgeTotal = config.shouldShowActivityBarBadge() ? total : 0;
        todoTreeView.badge = { value: badgeTotal, tooltip: "TaskVision annotations" };

        if (statusBar === STATUS_BAR_CURRENT_FILE) {
            let fileFilter;

            if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
                fileFilter = vscode.window.activeTextEditor.document.fileName;
            }

            counts = provider.getTagCountsForStatusBar(fileFilter);
            total = Object.values(counts).reduce(function (a, b) { return a + b; }, 0);
        }

        const countRegex = new RegExp("([^(]*)(\\(\\d+\\))*");
        const match = countRegex.exec(todoTreeView.title || '');
        if (match !== null) {
            let title;
            if (config.shouldFlatten()) {
                title = "Flat";
            }
            else if (config.shouldShowTagsOnly()) {
                title = "Tags";
            }
            else {
                title = "Tree";
            }

            if (total > 0 && vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('showCountsInTree')! === true) {
                title += " (" + total + ")";
            }
            todoTreeView.title = title;
        }

        if (statusBar === STATUS_BAR_TOTAL) {
            statusBarIndicator.text = "$(check) " + total;
            statusBarIndicator.tooltip = "TaskVision total";
            statusBarIndicator.show();
        }
        else if (statusBar === STATUS_BAR_TAGS || statusBar === STATUS_BAR_CURRENT_FILE || statusBar === STATUS_BAR_TOP_THREE) {
            let sortedTags = Object.keys(counts);
            if (statusBar === STATUS_BAR_TOP_THREE) {
                sortedTags.sort(function (a, b) { return counts[a] < counts[b] ? 1 : counts[b] < counts[a] ? -1 : a > b ? 1 : -1; });
                sortedTags = sortedTags.splice(0, 3);
            }
            else {
                sortedTags = config.tags();
            }
            let text = "";
            const showIcons = config.shouldShowIconsInsteadOfTagsInStatusBar();
            sortedTags.map(function (tag) {
                if (counts[tag] > 0) {
                    if (text.length > 0) {
                        text += " ";
                    }
                    let icon = attributes.getIcon(tag);
                    if (icon != config.defaultHighlight().icon && showIcons) {
                        if (!utils.isCodicon(icon || '')) {
                            icon = "$(" + icon + ")";
                        }
                        text += icon + " " + counts[tag] + "  ";
                    }
                    else {
                        text += tag + ": " + counts[tag] + " ";
                    }
                }
            });
            statusBarIndicator.text = showIcons ? text.trim() : "$(check) " + text.trim();
            if (statusBar === STATUS_BAR_CURRENT_FILE) {
                statusBarIndicator.tooltip = "TaskVision tags counts in current file";
            }
            else if (statusBar === STATUS_BAR_TOP_THREE) {
                statusBarIndicator.tooltip = "TaskVision top three tag counts";
            }
            else {
                statusBarIndicator.tooltip = "TaskVision tags counts";
            }
            if (Object.keys(counts).length === 0) {
                statusBarIndicator.text = "$(check) 0";
            }
            statusBarIndicator.show();
        }
        else {
            statusBarIndicator.hide();
        }

        const scanMode = config.scanMode();
        if (scanMode === SCAN_MODE_OPEN_FILES) {
            statusBarIndicator.text += " (in open files)";
        }
        else if (scanMode === SCAN_MODE_CURRENT_FILE) {
            statusBarIndicator.text += " (in current file)";
        }

        statusBarIndicator.command = "taskvision.onStatusBarClicked";
    }

    function onStatusBarClicked() {
        if (config.clickingStatusBarShouldRevealTree()) {
            if (todoTreeView.visible === false) {
                vscode.commands.executeCommand('taskvision-view.focus');
            }
        }
        else if (config.clickingStatusBarShouldToggleHighlights()) {
            const enabled = vscode.workspace.getConfiguration('taskvision.highlights').get<boolean>('enabled')!;
            const target = settingLocation('highlights.enabled');
            vscode.workspace.getConfiguration('taskvision.highlights').update('enabled', !enabled, target);
        }
        else {
            let setting = vscode.workspace.getConfiguration('taskvision.general').get<string>('statusBar')!;
            if (setting === STATUS_BAR_TOTAL) {
                setting = STATUS_BAR_TAGS;
                vscode.window.showInformationMessage("TaskVision: Now showing tag counts");
            }
            else if (setting === STATUS_BAR_TAGS) {
                setting = STATUS_BAR_TOP_THREE;
                vscode.window.showInformationMessage("TaskVision: Now showing top three tag counts");
            }
            else if (setting === STATUS_BAR_TOP_THREE) {
                setting = STATUS_BAR_CURRENT_FILE;
                vscode.window.showInformationMessage("TaskVision: Now showing total tags in current file");
            }
            else {
                setting = STATUS_BAR_TOTAL;
                vscode.window.showInformationMessage("TaskVision: Now showing total tags");
            }
            vscode.workspace.getConfiguration('taskvision.general').update('statusBar', setting, true);
        }
    }

    function notifyBufferTruncated(maxBuffer?: number) {
        debug("Search output exceeded maxBuffer of " + maxBuffer + " KB - showing partial results");
        if (bufferTruncationWarningShown) {
            return;
        }
        bufferTruncationWarningShown = true;
        vscode.window.showWarningMessage("TaskVision: Search output exceeded the buffer limit (" + maxBuffer + " KB), so only partial results are shown. Increase 'taskvision.ripgrep.ripgrepMaxBuffer' to see all tags.", OPEN_SETTINGS_BUTTON, OK_BUTTON).then(function (button) {
            if (button === OPEN_SETTINGS_BUTTON) {
                vscode.commands.executeCommand('workbench.action.openSettings', 'taskvision.ripgrep.ripgrepMaxBuffer');
            }
        });
    }

    function search(options: ripgrep.SearchOptions) {
        debug("Searching " + options.filename + "...");

        return ripgrep.search("/", options).then(matches => {
            if (matches && matches.truncated === true) {
                notifyBufferTruncated(matches.maxBuffer || options.maxBuffer);
            }
            if (matches.length > 0) {
                matches.forEach(match => {
                    match.uri = vscode.Uri.file(match.fsPath);
                    debug(" Match (File): " + JSON.stringify(match));
                    searchResults.add(toEditorSearchResult(match, vscode.Uri.file(match.fsPath)));
                });
            }
            else if (options.filename) {
                searchResults.remove(vscode.Uri.file(options.filename));
            }
        }).catch(e => {
            let message = e.message;
            if (e.stderr) {
                message += " (" + e.stderr + ")";
            }
            vscode.window.showErrorMessage("TaskVision: " + message);
        });
    }

    function addGlobs(source: Record<string, unknown>, target: string[], exclude?: boolean) {
        Object.keys(source).map(function (glob) {
            if (source.hasOwnProperty(glob) && source[glob] === true) {
                target = target.concat((exclude === true ? '!' : '') + glob);
            }
        });

        return target;
    }

    function getGeneratedOutputExcludeGlobs() {
        const globs: string[] = [];

        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(function (folder) {
                if (!folder.uri || folder.uri.scheme !== 'file') {
                    return;
                }

                const absoluteOutputFolder = taskMetaStore.getOutputFolder(folder.uri.fsPath, config.aiContextOutputDir());
                const relativeOutputGlob = taskMetaStore.getOutputRelativeGlob(folder.uri.fsPath, config.aiContextOutputDir());

                if (absoluteOutputFolder) {
                    globs.push(absoluteOutputFolder.replace(/\\/g, '/') + '/**');
                }
                if (relativeOutputGlob) {
                    globs.push(relativeOutputGlob);
                }
            });
        }

        return Array.from(new Set(globs));
    }

    function isGeneratedOutputPath(filePath: string) {
        if (!filePath || !vscode.workspace.workspaceFolders) {
            return false;
        }

        return vscode.workspace.workspaceFolders.some(function (folder) {
            return folder.uri &&
                folder.uri.scheme === 'file' &&
                taskMetaStore.isOutputPath(folder.uri.fsPath, filePath, config.aiContextOutputDir());
        });
    }

    function buildGlobsForRipgrep(includeGlobs: string[], excludeGlobs: string[], tempIncludeGlobs: string[], tempExcludeGlobs: string[], submoduleExcludeGlobs: string[], generatedExcludeGlobs: string[]) {
        let globs: string[] = includeGlobs.slice()
            .concat(tempIncludeGlobs)
            .concat(excludeGlobs.map(g => `!${g}`))
            .concat(tempExcludeGlobs.map(g => `!${g}`))
            .concat((generatedExcludeGlobs || []).map(g => `!${g}`));

        if (config.shouldUseBuiltInFileExcludes()) {
            globs = addGlobs(vscode.workspace.getConfiguration('files.exclude'), globs, true);
        }

        if (config.shouldUseBuiltInSearchExcludes()) {
            globs = addGlobs(vscode.workspace.getConfiguration('search.exclude'), globs, true);
        }

        if (config.shouldIgnoreGitSubmodules()) {
            globs = globs.concat(submoduleExcludeGlobs.map(g => `!${g}`));
        }

        return globs;
    }

    function getOptions(filename?: string) {
        const c = vscode.workspace.getConfiguration('taskvision');

        const tempIncludeGlobs = context.workspaceState.get<string[]>('includeGlobs')! || [];
        const tempExcludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];
        const submoduleExcludeGlobs = context.workspaceState.get<string[]>('submoduleExcludeGlobs')! || [];

        const options: ripgrep.SearchOptions = {
            regex: utils.getRegexSource(),
            unquotedRegex: utils.getRegexSource(),
            rgPath: config.ripgrepPath()
        };

        const globs = c.get<boolean>('filtering.passGlobsToRipgrep')! === true ? buildGlobsForRipgrep(
            c.get<string[]>('filtering.includeGlobs')!,
            c.get<string[]>('filtering.excludeGlobs')!,
            tempIncludeGlobs,
            tempExcludeGlobs,
            submoduleExcludeGlobs,
            getGeneratedOutputExcludeGlobs()) : undefined;

        if (globs && globs.length > 0) {
            options.globs = globs;
        }
        if (filename) {
            options.filename = filename;
        }

        const storagePath = context.storageUri && context.storageUri.fsPath;
        if (storagePath && !fs.existsSync(storagePath)) {
            debug("Attempting to create local storage folder " + storagePath);
            fs.mkdirSync(storagePath, { recursive: true });
        }

        options.outputChannel = outputChannel;
        options.additional = c.get<string>('ripgrep.ripgrepArgs')! || '';
        options.maxBuffer = c.get<number>('ripgrep.ripgrepMaxBuffer')!;
        options.multiline = utils.getRegexSource().indexOf("\\n") > -1 || c.get<boolean>('regex.enableMultiLine')! === true;

        if (storagePath && fs.existsSync(storagePath) === true && c.get<boolean>('ripgrep.usePatternFile')! === true) {
            const patternFileName = crypto.randomBytes(6).readUIntLE(0, 6).toString(36) + '.txt';
            options.patternFilePath = path.join(storagePath, patternFileName);
        }

        if (c.get<boolean>('filtering.includeHiddenFiles')!) {
            options.additional += ' --hidden ';
        }
        if (c.get<boolean>('regex.regexCaseSensitive')! === false) {
            options.additional += ' -i ';
        }

        return options;
    }

    function searchWorkspaces(searchList: string[]) {
        const scanMode = config.scanMode();
        if (scanMode === SCAN_MODE_WORKSPACE_AND_OPEN_FILES || scanMode === SCAN_MODE_WORKSPACE_ONLY) {
            const includes = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('includedWorkspaces', []);
            const excludes = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('excludedWorkspaces', []);
            if (vscode.workspace.workspaceFolders) {
                vscode.workspace.workspaceFolders.map(function (folder) {
                    if (folder.uri && folder.uri.scheme === 'file' && utils.isIncluded(folder.uri.fsPath, includes, excludes)) {
                        searchList.push(folder.uri.fsPath);
                    }
                });
            }
        }
    }

    function refreshOpenFiles() {
        if (config.scanMode() !== SCAN_MODE_WORKSPACE_ONLY) {
            Object.keys(openDocuments).map(function (document) {
                refreshFile(openDocuments[document]);
            });
        }
    }

    function applyGlobs() {
        const includeGlobs = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('includeGlobs')!;
        const excludeGlobs = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('excludeGlobs')!;

        const tempIncludeGlobs = context.workspaceState.get<string[]>('includeGlobs')! || [];
        const tempExcludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];
        const generatedExcludeGlobs = getGeneratedOutputExcludeGlobs();

        if (includeGlobs.length + excludeGlobs.length + tempIncludeGlobs.length + tempExcludeGlobs.length + generatedExcludeGlobs.length > 0) {
            debug("Applying globs to " + searchResults.count() + " items...");

            searchResults.filter(function (match) {
                return isIncluded(match.uri);
            });

            debug("Remaining items: " + searchResults.count());
        }
    }

    function iterateSearchList() {
        if (searchList.length > 0) {
            return searchList.reduce((p, entry) => p.finally(() => search(getOptions(entry))), Promise.resolve())
                .finally(() => {
                    debug("Found " + searchResults.count() + " items");
                    if (vscode.workspace.getConfiguration('taskvision.ripgrep').get<boolean>('passGlobsToRipgrep')! !== true) {
                        applyGlobs();
                    }
                    addResultsToTree();
                    setButtonsAndContext();
                });
        }
        else {
            addResultsToTree();
            setButtonsAndContext();
            return Promise.resolve();
        }
    }

    function getRootFolders() {
        let rootFolders = [];
        let valid = true;
        const rootFolder = vscode.workspace.getConfiguration('taskvision.general').get<string>('rootFolder')!;
        if (rootFolder.indexOf("${workspaceFolder}") > -1) {
            if (vscode.workspace.workspaceFolders) {
                vscode.workspace.workspaceFolders.map(function (folder) {
                    let path = rootFolder;
                    path = path.replace(/\$\{workspaceFolder\}/g, folder.uri.fsPath);
                    rootFolders.push(path);
                });
            }
            else {
                valid = false;
            }
        }
        else if (rootFolder !== "") {
            //Using the VS Code URI api to get the fspath, which will follow case sensitivity of platform
            rootFolders.push(vscode.Uri.file(rootFolder).fsPath);
        }

        rootFolders.forEach(function (rootFolder) {
            rootFolder = utils.replaceEnvironmentVariables(rootFolder);
        });

        const includes = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('includedWorkspaces', []);
        const excludes = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('excludedWorkspaces', []);

        if (valid === true) {
            rootFolders = rootFolders.filter(function (folder) {
                return utils.isIncluded(folder, includes, excludes);
            });
        }

        return valid === true ? rootFolders : undefined;
    }

    function rebuild() {
        todoTreeView.message = "";

        searchResults.clear();
        searchList = [];

        provider.clear(vscode.workspace.workspaceFolders);

        interrupted = false;
        bufferTruncationWarningShown = false;

        statusBarIndicator.text = "TaskVision: Scanning...";
        statusBarIndicator.show();
        statusBarIndicator.command = "taskvision.stopScan";
        statusBarIndicator.tooltip = "Click to interrupt scan";

        searchList = getRootFolders() || [];

        if (searchList.length === 0) {
            searchWorkspaces(searchList);
        }

        if (config.shouldIgnoreGitSubmodules()) {
            let submoduleExcludeGlobs: string[] = [];
            searchList.forEach(function (rootPath) {
                submoduleExcludeGlobs = submoduleExcludeGlobs.concat(utils.getSubmoduleExcludeGlobs(rootPath));
            });
            context.workspaceState.update('submoduleExcludeGlobs', submoduleExcludeGlobs);
        }

        iterateSearchList()
            .finally(refreshOpenFiles)
            .then(addResultsToTree);
    }

    function triggerRescan() {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(function () {
            rebuild();
        }, 1000);
    }

    function resetGitWatcher() {
        function checkGitHead() {
            if (vscode.workspace.workspaceFolders) {
                vscode.workspace.workspaceFolders.map(function (folder) {
                    child_process.exec("git rev-parse HEAD", { cwd: folder.uri.fsPath }, (err, stdout) => {
                        if (err) {
                            lastGitHead[folder.uri.fsPath] = '';
                            return;
                        }
                        const gitHead = stdout.toString();
                        if (lastGitHead[folder.uri.fsPath] !== undefined && gitHead != lastGitHead[folder.uri.fsPath]) {
                            debug('Rescan triggered by change to git repository');
                            triggerRescan();
                        }
                        lastGitHead[folder.uri.fsPath] = gitHead;
                    });
                });
            }
        }

        const timerInterval = vscode.workspace.getConfiguration('taskvision.general').get<number>('automaticGitRefreshInterval')!;

        if (autoGitRefreshTimer) {
            clearInterval(autoGitRefreshTimer);
        }

        if (timerInterval > 0) {
            debug('Setting automatic Git refresh interval to ' + timerInterval + ' seconds');
            autoGitRefreshTimer = setInterval(checkGitHead, timerInterval * 1000);
        }
        else {
            debug('Automatic Git refresh disabled');
        }
    }

    function resetPeriodicRefresh() {
        const timerInterval = vscode.workspace.getConfiguration('taskvision.general').get<number>('periodicRefreshInterval')!;

        if (periodicRefreshTimer) {
            clearInterval(periodicRefreshTimer);
        }

        if (timerInterval > 0) {
            debug('Setting periodic refresh interval to ' + timerInterval + ' minutes');
            periodicRefreshTimer = setInterval(triggerRescan, timerInterval * 1000 * 60);
        }
        else {
            debug('Periodic refresh disabled');
        }
    }

    function setButtonsAndContext() {
        const c = vscode.workspace.getConfiguration('taskvision');
        const isTagsOnly = context.workspaceState.get('tagsOnly', c.get('tree.tagsOnly', false));
        const isGroupedByTag = context.workspaceState.get('groupedByTag', c.get('tree.groupedByTag', false));
        const isGroupedBySubTag = context.workspaceState.get('groupedBySubTag', c.get('tree.groupedBySubTag', false));
        const isCollapsible = !isTagsOnly || isGroupedByTag || isGroupedBySubTag;
        const includeGlobs = context.workspaceState.get<string[]>('includeGlobs')! || [];
        const excludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];
        const hasSubTags = provider.hasSubTags();

        const showRevealButton = c.get<Record<string, boolean>>('tree.buttons')!.reveal === true;
        const showScanModeButton = c.get<Record<string, boolean>>('tree.buttons')!.scanMode === true;
        const showViewStyleButton = c.get<Record<string, boolean>>('tree.buttons')!.viewStyle === true;
        const showGroupByTagButton = c.get<Record<string, boolean>>('tree.buttons')!.groupByTag === true;
        const showGroupBySubTagButton = c.get<Record<string, boolean>>('tree.buttons')!.groupBySubTag === true;
        const showFilterButton = c.get<Record<string, boolean>>('tree.buttons')!.filter === true;
        const showRefreshButton = c.get<Record<string, boolean>>('tree.buttons')!.refresh === true;
        const showExpandButton = c.get<Record<string, boolean>>('tree.buttons')!.expand === true;
        const showExportButton = c.get<Record<string, boolean>>('tree.buttons')!.export === true;

        vscode.commands.executeCommand('setContext', 'taskvision-show-reveal-button', showRevealButton && !c.get('tree.trackFile', false));
        vscode.commands.executeCommand('setContext', 'taskvision-show-scan-mode-button', showScanModeButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-view-style-button', showViewStyleButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-group-by-tag-button', showGroupByTagButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-group-by-sub-tag-button', showGroupBySubTagButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-filter-button', showFilterButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-refresh-button', showRefreshButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-expand-button', showExpandButton);
        vscode.commands.executeCommand('setContext', 'taskvision-show-export-button', showExportButton);

        vscode.commands.executeCommand('setContext', 'taskvision-expanded', context.workspaceState.get('expanded', c.get('tree.expanded', false)));
        vscode.commands.executeCommand('setContext', 'taskvision-flat', context.workspaceState.get('flat', c.get('tree.flat', false)));
        vscode.commands.executeCommand('setContext', 'taskvision-tags-only', isTagsOnly);
        vscode.commands.executeCommand('setContext', 'taskvision-grouped-by-tag', isGroupedByTag);
        vscode.commands.executeCommand('setContext', 'taskvision-grouped-by-sub-tag', isGroupedBySubTag);
        vscode.commands.executeCommand('setContext', 'taskvision-filtered', context.workspaceState.get('filtered', false));
        vscode.commands.executeCommand('setContext', 'taskvision-status-filter-active', currentStatusFilter && currentStatusFilter.length > 0);
        vscode.commands.executeCommand('setContext', 'taskvision-collapsible', isCollapsible);
        vscode.commands.executeCommand('setContext', 'taskvision-folder-filter-active', includeGlobs.length + excludeGlobs.length > 0);
        vscode.commands.executeCommand('setContext', 'taskvision-global-filter-active', currentFilter);
        vscode.commands.executeCommand('setContext', 'taskvision-can-toggle-compact-folders', vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders')! === true);
        vscode.commands.executeCommand('setContext', 'taskvision-has-sub-tags', hasSubTags);

        vscode.commands.executeCommand('setContext', 'taskvision-scan-mode', config.scanMode());

        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(hideTreeIfEmpty, 1000);
    }

    function hideTreeIfEmpty() {
        let children = provider.getChildren();
        children = children.filter(function (child) {
            return child.isStatusNode !== true;
        });

        if (vscode.workspace.getConfiguration('taskvision').get("tree.hideTreeWhenEmpty") === true) {
            vscode.commands.executeCommand('setContext', 'taskvision-is-empty', children.length == 0);
        }
        else {
            vscode.commands.executeCommand('setContext', 'taskvision-is-empty', false);
        }
    }

    function isIncluded(uri: vscode.Uri) {
        if (uri.fsPath) {
            if (isGeneratedOutputPath(uri.fsPath)) {
                return false;
            }

            const includeGlobs = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('includeGlobs')!;
            let excludeGlobs = vscode.workspace.getConfiguration('taskvision.filtering').get<string[]>('excludeGlobs')!;
            const includeHiddenFiles = vscode.workspace.getConfiguration('taskvision.filtering').get<boolean>('includeHiddenFiles')!;

            const tempIncludeGlobs = context.workspaceState.get<string[]>('includeGlobs')! || [];
            const tempExcludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];

            if (config.shouldUseBuiltInFileExcludes()) {
                excludeGlobs = addGlobs(vscode.workspace.getConfiguration('files.exclude'), excludeGlobs);
            }

            if (config.shouldUseBuiltInSearchExcludes()) {
                excludeGlobs = addGlobs(vscode.workspace.getConfiguration('search.exclude'), excludeGlobs);
            }

            const isHidden = utils.isHidden(uri.fsPath);
            const included = utils.isIncluded(uri.fsPath, includeGlobs.concat(tempIncludeGlobs), excludeGlobs.concat(tempExcludeGlobs));

            return included && (!isHidden || includeHiddenFiles);
        }

        return false;
    }

    function refreshFile(document: vscode.TextDocument) {
        function addResult(offset: number, removeLeadingComments?: boolean) {
            const position = document.positionAt(offset);
            let line = document.lineAt(position.line).text;
            if (removeLeadingComments === true) {
                line = utils.removeLineComments(line, document.fileName);
            }

            return {
                uri: document.uri,
                line: position.line + 1,
                column: position.character + 1,
                match: line
            };
        }

        let matchesFound = false;

        searchResults.remove(document.uri);

        if (config.isValidScheme(document.uri) && isIncluded(document.uri) === true) {
            if (config.scanMode() !== SCAN_MODE_CURRENT_FILE || (vscode.window.activeTextEditor && document.fileName === vscode.window.activeTextEditor.document.fileName)) {
                const text = document.getText();
                const regex = utils.getRegexForEditorSearch(true);

                let match;
                while ((match = regex.exec(text)) !== null) {
                    while (text[match.index] === '\n' || text[match.index] === '\r') {
                        match.index++;
                        match[0] = match[0].substring(1);
                    }

                    let offset = match.index;
                    const sections = match[0].split("\n");

                    const result: import("./model").SearchResult = addResult(offset, false);

                    if (sections.length > 1) {
                        result.extraLines = [];
                        offset += sections[0].length + 1;
                        sections.shift();
                        sections.forEach(section => {
                            result.extraLines!.push(addResult(offset, true));
                            offset += section.length + 1;
                        });
                    }

                    if (!searchResults.contains(result)) {
                        searchResults.add(result);
                        matchesFound = true;
                    }
                }
            }
        }

        if (matchesFound === true) {
            provider.reset(document.uri);
        }
        else {
            provider.remove(undefined, document.uri);
        }

        addResultsToTree();
    }

    function refresh() {
        searchResults.markAsNotAdded();

        provider.clear(vscode.workspace.workspaceFolders);
        provider.rebuild();

        refreshOpenFiles();

        addResultsToTree();
        setButtonsAndContext();
    }

    function clearExpansionStateAndRefresh() {
        provider.clearExpansionState();
        refresh();
    }

    function showFlatView() {
        context.workspaceState.update('tagsOnly', false);
        context.workspaceState.update('flat', true).then(refresh);
    }

    function showTagsOnlyView() {
        context.workspaceState.update('flat', false);
        context.workspaceState.update('tagsOnly', true).then(refresh);
    }

    function showTreeView() {
        context.workspaceState.update('tagsOnly', false);
        context.workspaceState.update('flat', false).then(refresh);
    }

    function collapse() { context.workspaceState.update('expanded', false).then(clearExpansionStateAndRefresh); }
    function expand() { context.workspaceState.update('expanded', true).then(clearExpansionStateAndRefresh); }
    function groupByTag() { context.workspaceState.update('groupedByTag', true).then(refresh); }
    function ungroupByTag() { context.workspaceState.update('groupedByTag', false).then(refresh); }
    function groupBySubTag() { context.workspaceState.update('groupedBySubTag', true).then(refresh); }
    function ungroupBySubTag() { context.workspaceState.update('groupedBySubTag', false).then(refresh); }

    function clearTreeFilter() {
        currentFilter = undefined;
        context.workspaceState.update('filtered', false);
        context.workspaceState.update('currentFilter', undefined);
        provider.clearTreeFilter();
        refreshTree();
    }

    function addTag(tag: string) {
        const tags = vscode.workspace.getConfiguration('taskvision.general').get<string[]>('tags')!;
        if (tags.indexOf(tag) === -1) {
            tags.push(tag);
            vscode.workspace.getConfiguration('taskvision.general').update('tags', tags, true);
        }
    }

    function addTagDialog() {
        vscode.window.showInputBox({ prompt: nativeText('New tag', '新建标签'), placeHolder: nativeText('e.g. FIXME', '例如 FIXME') }).then(function (tag) {
            if (tag) {
                addTag(tag);
            }
        });
    }

    function removeTagDialog() {
        let tags = vscode.workspace.getConfiguration('taskvision.general').get<string[]>('tags')!;
        vscode.window.showQuickPick(tags, { matchOnDetail: true, matchOnDescription: true, canPickMany: true, placeHolder: nativeText('Select tags to remove', '选择要移除的标签') }).then(function (tagsToRemove) {
            if (tagsToRemove) {
                tagsToRemove.map(tag => {
                    tags = tags.filter(t => tag != t);
                });
                vscode.workspace.getConfiguration('taskvision.general').update('tags', tags, true);
            }
        });
    }

    function scanWorkspaceAndOpenFiles() {
        vscode.workspace.getConfiguration('taskvision.tree').update('scanMode', SCAN_MODE_WORKSPACE_AND_OPEN_FILES, vscode.ConfigurationTarget.Workspace);
    }

    function scanOpenFilesOnly() {
        vscode.workspace.getConfiguration('taskvision.tree').update('scanMode', SCAN_MODE_OPEN_FILES, vscode.ConfigurationTarget.Workspace);
    }

    function scanCurrentFileOnly() {
        vscode.workspace.getConfiguration('taskvision.tree').update('scanMode', SCAN_MODE_CURRENT_FILE, vscode.ConfigurationTarget.Workspace);
    }

    function scanWorkspaceOnly() {
        vscode.workspace.getConfiguration('taskvision.tree').update('scanMode', SCAN_MODE_WORKSPACE_ONLY, vscode.ConfigurationTarget.Workspace);
    }

    function dumpFolderFilter() {
        debug("Folder filter include:" + JSON.stringify(context.workspaceState.get<string[]>('includeGlobs')!));
        debug("Folder filter exclude:" + JSON.stringify(context.workspaceState.get<string[]>('excludeGlobs')!));
    }

    function checkForMarkdownUpgrade() {
        if (markdownUpdatePopupOpen === false && ignoreMarkdownUpdate === false) {
            const c = vscode.workspace.getConfiguration('taskvision');
            if (c.get<string>('regex.regex')!.indexOf("|^\\s*- \\[ \\])") > -1) {
                markdownUpdatePopupOpen = true;
                setTimeout(function () {
                    // Information messages seem to self close after 15 seconds.
                    markdownUpdatePopupOpen = false;
                }, 15000);
                let message = "TaskVision: There is now an improved method of locating markdown TODOs.";
                const buttons = [MORE_INFO_BUTTON, NEVER_SHOW_AGAIN_BUTTON];
                if (c.get<string>('regex.regex')! === c.inspect('regex.regex')?.defaultValue) {
                    message += " Would you like to update your settings automatically?";
                    buttons.unshift(YES_BUTTON);
                }
                vscode.window.showInformationMessage(message, ...buttons).then(function (button) {
                    markdownUpdatePopupOpen = false;
                    if (button === undefined) {
                        ignoreMarkdownUpdate = true;
                    }
                    else if (button === YES_BUTTON) {
                        ignoreMarkdownUpdate = true;
                        addTag('[ ]');
                        addTag('[x]');
                        c.update('regex.regex', '(//|#|<!--|;|/\\*|%|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)', true);
                    }
                    else if (button === MORE_INFO_BUTTON) {
                        vscode.env.openExternal(vscode.Uri.parse("https://github.com/Yuki-zik/taskvision#markdown-support"));
                    }
                    else if (button === NEVER_SHOW_AGAIN_BUTTON) {
                        context.globalState.update('ignoreMarkdownUpdate', true);
                        ignoreMarkdownUpdate = true;
                    }
                });
            }
        }
    }

    function getWorkspaceRootForFile(filePath: string) {
        let match: string | undefined;

        if (!filePath || !vscode.workspace.workspaceFolders) {
            return undefined;
        }

        vscode.workspace.workspaceFolders.forEach(function (folder) {
            if (!folder.uri || folder.uri.scheme !== 'file') {
                return;
            }

            const folderPath = folder.uri.fsPath;
            const relative = path.relative(folderPath, filePath);
            if (relative === '' || (relative && relative.indexOf('..') !== 0 && path.isAbsolute(relative) === false)) {
                if (!match || folderPath.length > match.length) {
                    match = folderPath;
                }
            }
        });

        return match;
    }

    function hasActiveStatusFilter() {
        return Array.isArray(currentStatusFilter) && currentStatusFilter.length > 0;
    }

    function buildTaskScopeLabel(node?: TreeNode) {
        if (node) {
            if (node.type === 'todo') {
                return 'task:' + (node.taskId || (node.fsPath + ':' + ((node.line ?? 0) + 1)));
            }
            if (node.fsPath) {
                return 'subtree:' + node.fsPath;
            }
        }

        if (config.shouldRespectCurrentFiltersForAiContext()) {
            if (currentFilter || hasActiveStatusFilter()) {
                return 'visible-tree-filtered';
            }

            return 'visible-tree';
        }

        return 'all-tasks';
    }

    function dedupeStrings(values: unknown) {
        return strings(values);
    }

    function getNodesForRoot(rootPath: string) {
        return (provider ? provider.getAllTodoNodes() : []).filter(function (node) {
            return (node.rootPath || getWorkspaceRootForFile(node.fsPath)) === rootPath;
        });
    }

    function getSyncNodesForRoot(rootPath: string, syncOptions?: SyncOptions) {
        return selectSyncNodesForRoot(rootPath, getNodesForRoot(rootPath), syncOptions, getWorkspaceRootForFile);
    }

    function collectRootPaths(nodes: TodoNode[]) {
        const seen: Record<string, boolean> = {};
        (nodes || []).forEach(function (node) {
            const rootPath = node && (node.rootPath || getWorkspaceRootForFile(node.fsPath));
            if (rootPath) {
                seen[rootPath] = true;
            }
        });
        return Object.keys(seen);
    }

    function ensureStableIdsInSource(nodes: TodoNode[], options?: SyncOptions) {
        const ensureOptions = options || {};
        const referencedStableIds = collectReferencedStableIds(nodes);
        const candidates = (nodes || []).filter(function (node) {
            return node &&
                node.rootPath &&
                node.actualTag &&
                (isTaskAnnotationNode(node) || isContextAnnotationNode(node)) &&
                !node.explicitStableId &&
                shouldEnsureStableIdForNode(node, ensureOptions, referencedStableIds, config.defaultTaskPriority());
        });

        if (candidates.length === 0) {
            return Promise.resolve(nodes || []);
        }

        const documentUris: Record<string, vscode.Uri> = {};
        candidates.forEach(function (node) {
            const targetUri = node.uri ? node.uri : vscode.Uri.file(node.fsPath);
            if (targetUri && targetUri.scheme === 'file') {
                documentUris[targetUri.toString()] = targetUri;
            }
        });

        return Promise.all(Object.keys(documentUris).map(function (key) {
            return vscode.workspace.openTextDocument(documentUris[key]);
        })).then(function (documents) {
            const documentsByUri: Record<string, vscode.TextDocument> = {};
            const edit = new vscode.WorkspaceEdit();
            let changed = 0;

            documents.forEach(function (document) {
                documentsByUri[document.uri.toString()] = document;
            });

            candidates.forEach(function (node) {
                const targetUri = node.uri ? node.uri : vscode.Uri.file(node.fsPath);
                const document = documentsByUri[targetUri.toString()];
                const stableId = deriveStableIdForNode(node);

                if (!document || !stableId) {
                    return;
                }

                const line = document.lineAt(node.line);
                const updatedLine = utils.upsertTvDirectivesInLine(line.text, node, buildDirectivePatchForNode(node, stableId));
                if (!updatedLine || updatedLine === line.text) {
                    return;
                }

                edit.replace(document.uri, line.range, updatedLine);
                node.stableId = stableId;
                node.explicitStableId = stableId;
                changed++;
            });

            if (changed === 0) {
                return nodes || [];
            }

            return Promise.resolve(vscode.workspace.applyEdit(edit)).then(function (applied) {
                if (!applied) {
                    throw new Error('VS Code rejected TaskVision stable ID edits');
                }

                documents.forEach(function (document) {
                    openDocuments[document.uri.toString()] = document;
                    refreshFile(document);
                });

                return collectRootPaths(nodes).reduce(function (all, rootPath) {
                    return all.concat(getNodesForRoot(rootPath));
                }, [] as TodoNode[]);
            });
        });
    }

    function syncRootData(rootPath: string, scopeLabel: string, options?: SyncOptions) {
        const syncOptions = options || {};
        const updatedAt = syncOptions.updatedAt || new Date().toISOString();
        const actor = syncOptions.actor || 'user';
        const outputDir = config.aiContextOutputDir();
        const initialRootNodes = getSyncNodesForRoot(rootPath, syncOptions);

        return ensureStableIdsInSource(initialRootNodes, {
                forceStableIds: syncOptions.forceStableIds === true
            }).then(function () {
            const rootNodes = getSyncNodesForRoot(rootPath, syncOptions);
            const taskNodes = rootNodes.filter(isTaskAnnotationNode);
            const contextNodes = rootNodes.filter(isContextAnnotationNode);
            const reviewNodes = rootNodes.filter(isReviewAnnotationNode);
            const taskContextRefs: Record<string, string[]> = {};
            const groupedContexts: Record<string, ContextCard> = {};
            const groupedSessions: Record<string, Omit<ChangeSession, "version">> = {};

            taskNodes.forEach(function (node) {
                const stableId = deriveStableIdForNode(node);
                taskMetaStore.ensureTaskStableId(rootPath, node.taskId, stableId, actor, updatedAt, outputDir);
                taskMetaStore.updateTask(rootPath, node.taskId, {
                    stableId: stableId,
                    file: node.fsPath,
                    line: (node.line ?? 0) + 1,
                    lastActor: actor,
                    updatedAt: updatedAt
                }, outputDir);
                node.stableId = stableId;
            });

            contextNodes.forEach(function (node) {
                const contextId = deriveStableIdForNode(node);
                if (!contextId) return;
                const existing: Partial<ContextCard> = groupedContexts[contextId!] || contextStore.getContext(rootPath, contextId, outputDir) || {};
                const summary = node.after || node.label || '';

                if (!groupedContexts[contextId]) {
                    groupedContexts[contextId] = {
                        contextId: contextId,
                        kind: node.contextKind,
                        title: existing.title || summary,
                        summary: summary,
                        body: existing.body || summary,
                        taskRefs: [],
                        anchors: [],
                        updatedBy: actor,
                        updatedAt: updatedAt,
                        freshness: existing.freshness || 'active'
                    };
                }

                groupedContexts[contextId].taskRefs = dedupeStrings(groupedContexts[contextId].taskRefs.concat(node.taskRefs || existing.taskRefs || []));
                groupedContexts[contextId].anchors.push({
                    file: path.relative(rootPath, node.fsPath).replace(/\\/g, '/'),
                    line: (node.line ?? 0) + 1,
                    tag: node.actualTag || node.tag
                });

                groupedContexts[contextId].taskRefs.forEach(function (taskRef) {
                    if (!taskContextRefs[taskRef]) {
                        taskContextRefs[taskRef] = [];
                    }
                    taskContextRefs[taskRef].push(contextId);
                });
            });

            Object.keys(groupedContexts).forEach(function (contextId) {
                const context = groupedContexts[contextId];
                contextStore.upsertContext(rootPath, contextId, {
                    kind: context.kind,
                    title: context.title,
                    summary: context.summary,
                    body: context.body,
                    taskRefs: context.taskRefs,
                    replaceTaskRefs: true,
                    anchors: context.anchors,
                    replaceAnchors: true,
                    updatedBy: context.updatedBy,
                    updatedAt: context.updatedAt,
                    freshness: context.freshness
                }, outputDir);
            });

            Object.keys(taskContextRefs).forEach(function (taskRef) {
                taskMetaStore.addTaskContextRefs(rootPath, taskRef, taskContextRefs[taskRef], actor, updatedAt, outputDir);
            });

            taskNodes.forEach(function (node) {
                node.contextRefs = dedupeStrings((node.contextRefs || []).concat(taskContextRefs[node.stableId || ''] || []));
            });

            reviewNodes.forEach(function (node) {
                if (!node.sessionId) {
                    return;
                }

                if (!groupedSessions[node.sessionId]) {
                    const existingSession = changeSessionStore.getSession(rootPath, node.sessionId, outputDir);
                    groupedSessions[node.sessionId] = {
                        sessionId: node.sessionId,
                        sessionType: existingSession ? existingSession.sessionType : 'review',
                        actor: existingSession ? existingSession.actor : 'agent',
                        status: existingSession ? existingSession.status : 'open',
                        createdAt: existingSession ? existingSession.createdAt : updatedAt,
                        updatedAt: updatedAt,
                        summary: existingSession && existingSession.summary ? existingSession.summary : 'Source annotations imported from review comments.',
                        taskRefs: [],
                        annotations: []
                    };
                }

                groupedSessions[node.sessionId].taskRefs = dedupeStrings(groupedSessions[node.sessionId].taskRefs.concat(node.taskRefs || []));
                groupedSessions[node.sessionId].annotations.push({
                    kind: node.reviewKind || 'followup',
                    file: path.relative(rootPath, node.fsPath).replace(/\\/g, '/'),
                    line: (node.line ?? 0) + 1,
                    stableId: node.stableId,
                    sourceComment: true,
                    reviewState: 'unread',
                    text: node.after || node.label || ''
                });
            });

            Object.keys(groupedSessions).forEach(function (sessionId) {
                changeSessionStore.syncSessionAnnotations(rootPath, sessionId, groupedSessions[sessionId], groupedSessions[sessionId].annotations, outputDir);
            });

            if (syncOptions.rebuildContext !== false) {
                aiContext.writeContextFiles(rootPath, scopeLabel || 'visible-tree', rootNodes, updatedAt, outputDir);
            }

            return rootNodes;
        });
    }

    function syncRoots(rootPaths: string[], scopeLabel: string, options?: SyncOptions) {
        const results: Record<string, TodoNode[]> = {};
        let sequence = Promise.resolve();

        (rootPaths || []).forEach(function (rootPath) {
            sequence = sequence.then(function () {
                return syncRootData(rootPath, scopeLabel, options).then(function (nodes) {
                    results[rootPath] = nodes;
                });
            });
        });

        return sequence.then(function () {
            return results;
        });
    }

    function refreshAiStatusReports() {
        const tasksByRoot: Record<string, TodoNode[]> = {};
        const allTasks = provider ? provider.getAllTodoNodes() : [];
        const generatedAt = new Date().toISOString();

        allTasks.forEach(function (task) {
            const rootPath = task.rootPath || getWorkspaceRootForFile(task.fsPath);
            if (!rootPath) {
                return;
            }

            if (!tasksByRoot[rootPath]) {
                tasksByRoot[rootPath] = [];
            }
            tasksByRoot[rootPath].push(task);
        });

        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(function (folder) {
                if (folder.uri && folder.uri.scheme === 'file') {
                    aiContext.writeStatusReport(
                        folder.uri.fsPath,
                        tasksByRoot[folder.uri.fsPath] || [],
                        generatedAt,
                        config.aiContextOutputDir()
                    );
                }
            });
        }
    }

    function getCurrentAgentSessionMap() {
        return context.workspaceState.get<Record<string, string>>('currentAgentSessions', {});
    }

    function getCurrentSessionIdForRoot(rootPath: string) {
        const sessions = getCurrentAgentSessionMap();
        return rootPath ? sessions[rootPath] : undefined;
    }

    function setCurrentSessionIdForRoot(rootPath: string, sessionId?: string) {
        if (!rootPath) {
            return Promise.resolve();
        }

        const sessions = getCurrentAgentSessionMap();
        if (sessionId) {
            sessions[rootPath] = sessionId;
        }
        else {
            delete sessions[rootPath];
        }
        return Promise.resolve(context.workspaceState.update('currentAgentSessions', sessions));
    }

    function resolveCommandRootPath(node?: TreeNode) {
        if (node && node.rootPath) {
            return node.rootPath;
        }

        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
            return getWorkspaceRootForFile(vscode.window.activeTextEditor.document.fileName);
        }

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        return undefined;
    }

    function ensureReviewSession(rootPath: string, actor?: string, summary?: string) {
        const outputDir = config.aiContextOutputDir();
        const currentSessionId = getCurrentSessionIdForRoot(rootPath);
        const existing = currentSessionId ? changeSessionStore.getSession(rootPath, currentSessionId, outputDir) : undefined;
        if (existing && existing.sessionType === 'review') {
            return Promise.resolve(existing);
        }

        const updatedAt = new Date().toISOString();
        const sessionId = changeSessionStore.createSessionId(rootPath, actor || 'agent', outputDir, updatedAt);
        const session = {
            sessionId: sessionId,
            sessionType: 'review',
            actor: actor || 'agent',
            status: 'open',
            createdAt: updatedAt,
            updatedAt: updatedAt,
            summary: summary || 'Session started from TaskVision',
            taskRefs: [],
            annotations: []
        };

        changeSessionStore.upsertSession(rootPath, session, outputDir);
        return setCurrentSessionIdForRoot(rootPath, sessionId).then(function () {
            return session;
        });
    }

    function insertAnnotationLine(document: vscode.TextDocument, lineNumber: number, annotationLine: string) {
        const lineStart = document.lineAt(lineNumber).range.start;
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, lineStart, annotationLine + '\n');

        return Promise.resolve(vscode.workspace.applyEdit(edit)).then(function (applied) {
            if (!applied) {
                throw new Error('VS Code rejected the annotation edit');
            }

            openDocuments[document.uri.toString()] = document;
            refreshFile(document);
        });
    }

    function syncDataModel(node?: TreeNode) {
        let rootPaths;
        const scopeLabel = buildTaskScopeLabel(node);

        if (node && node.rootPath) {
            rootPaths = [node.rootPath];
        }
        else {
            rootPaths = (vscode.workspace.workspaceFolders || []).filter(function (folder) {
                return folder.uri && folder.uri.scheme === 'file';
            }).map(function (folder) {
                return folder.uri.fsPath;
            });
        }

        if (!rootPaths || rootPaths.length === 0) {
            vscode.window.showWarningMessage('TaskVision: No workspace root is available for data sync.');
            return;
        }

        syncRoots(rootPaths, scopeLabel, {
            actor: 'user',
            rebuildContext: true
        }).then(function () {
            refreshAiStatusReports();
            refreshTree();
            vscode.window.showInformationMessage('TaskVision: Data model synced for ' + rootPaths.length + ' workspace(s).');
        }).catch(function (error) {
            vscode.window.showErrorMessage('TaskVision: ' + error.message);
        });
    }

    function addContextAnnotation(node?: TreeNode) {
        const editor = vscode.window.activeTextEditor;
        const rootPath = resolveCommandRootPath(node);

        if (!editor || !rootPath) {
            vscode.window.showWarningMessage('TaskVision: An active workspace editor is required to add a context annotation.');
            return;
        }

        let selectedTaskRefs: string[] = [];
        if (isTaskAnnotationNode(node)) {
            selectedTaskRefs = [deriveStableIdForNode(node)].filter(present);
        }

        const currentSessionId = getCurrentSessionIdForRoot(rootPath);
        const lineNumber = editor.selection.active.line;
        const lineText = editor.document.lineAt(lineNumber).text;

        const kindItems = annotationParser.CONTEXT_KINDS.map(function (kind) {
            return { label: kind, value: kind };
        });

        vscode.window.showQuickPick(kindItems, {
            placeHolder: 'Choose a context kind'
        }).then(function (selectedKind) {
            if (!selectedKind) {
                return;
            }

            vscode.window.showInputBox({
                prompt: 'Context summary',
                placeHolder: 'Explain the invariant, constraint, decision, or pitfall'
            }).then(function (summary) {
                if (!summary) {
                    return;
                }

                const contextId = utils.createContextStableId(rootPath, editor.document.fileName, summary, selectedKind.value, lineNumber + 1);
                const annotationLine = utils.buildAnnotationComment(
                    editor.document.fileName,
                    lineText,
                    'NOTE',
                    'idea',
                    {
                        stableId: contextId,
                        contextKind: selectedKind.value,
                        taskRefs: selectedTaskRefs,
                        sessionId: currentSessionId
                    },
                    summary
                );

                insertAnnotationLine(editor.document, lineNumber, annotationLine).then(function () {
                    return syncRoots([rootPath], 'editor:' + editor.document.fileName, {
                        actor: 'user',
                        rebuildContext: true
                    });
                }).then(function () {
                    refreshTree();
                    vscode.window.showInformationMessage('TaskVision: Added context annotation `' + contextId + '`.');
                }).catch(function (error) {
                    vscode.window.showErrorMessage('TaskVision: ' + error.message);
                });
            });
        });
    }

    function startAgentSession(node?: TreeNode) {
        const rootPath = resolveCommandRootPath(node);
        if (!rootPath) {
            vscode.window.showWarningMessage('TaskVision: No workspace root is available to start an agent session.');
            return;
        }

        const sessionItems = annotationParser.SESSION_TYPES.map(function (sessionType) {
            return { label: sessionType, value: sessionType };
        });

        vscode.window.showQuickPick(sessionItems, {
            placeHolder: 'Choose an agent session type'
        }).then(function (selectedType) {
            if (!selectedType) {
                return;
            }

            vscode.window.showInputBox({
                prompt: 'Session actor',
                value: 'agent',
                placeHolder: 'e.g. codex, claude, agent'
            }).then(function (actor) {
                if (!actor) {
                    return;
                }

                vscode.window.showInputBox({
                    prompt: 'Session summary',
                    placeHolder: 'Optional summary for the session'
                }).then(function (summary) {
                    const updatedAt = new Date().toISOString();
                    const sessionId = changeSessionStore.createSessionId(rootPath, actor, config.aiContextOutputDir(), updatedAt);
                    const taskRefs = isTaskAnnotationNode(node) ? [deriveStableIdForNode(node)].filter(present) : [];
                    const session = {
                        sessionId: sessionId,
                        sessionType: selectedType.value,
                        actor: actor,
                        status: 'open',
                        createdAt: updatedAt,
                        updatedAt: updatedAt,
                        summary: summary || '',
                        taskRefs: taskRefs,
                        annotations: []
                    };

                    if (taskRefs.length > 0 && node && node.taskId) {
                        taskMetaStore.ensureTaskStableId(rootPath, node.taskId, taskRefs[0], 'user', updatedAt, config.aiContextOutputDir());
                    }

                    changeSessionStore.upsertSession(rootPath, session, config.aiContextOutputDir());
                    setCurrentSessionIdForRoot(rootPath, sessionId).then(function () {
                        refreshTree();
                        vscode.window.showInformationMessage('TaskVision: Started agent session `' + sessionId + '`.');
                    });
                });
            });
        });
    }

    function writeAgentAnnotations(node?: TreeNode) {
        const editor = vscode.window.activeTextEditor;
        const rootPath = resolveCommandRootPath(node);

        if (!editor || !rootPath) {
            vscode.window.showWarningMessage('TaskVision: An active workspace editor is required to write agent annotations.');
            return;
        }

        ensureReviewSession(rootPath, 'agent', 'Review annotations started from TaskVision').then(function (session) {
            const lineNumber = editor.selection.active.line;
            const lineText = editor.document.lineAt(lineNumber).text;
            const taskRefs = isTaskAnnotationNode(node) ? [deriveStableIdForNode(node)].filter(present) : [];
            const reviewItems = annotationParser.REVIEW_KINDS.map(function (kind) {
                return { label: kind, value: kind };
            });

            vscode.window.showQuickPick(reviewItems, {
                placeHolder: 'Choose an agent review annotation kind'
            }).then(function (selectedKind) {
                if (!selectedKind) {
                    return;
                }

                vscode.window.showInputBox({
                    prompt: 'Annotation text',
                    placeHolder: 'Describe the risk, verification step, or follow-up'
                }).then(function (annotationText) {
                    if (!annotationText) {
                        return;
                    }

                    const annotationLine = utils.buildAnnotationComment(
                        editor.document.fileName,
                        lineText,
                        'NOTE',
                        'review',
                        {
                            sessionId: session.sessionId,
                            taskRefs: taskRefs,
                            reviewKind: selectedKind.value
                        },
                        annotationText
                    );

                    insertAnnotationLine(editor.document, lineNumber, annotationLine).then(function () {
                        return syncRoots([rootPath], 'editor:' + editor.document.fileName, {
                            actor: 'agent',
                            rebuildContext: true
                        });
                    }).then(function () {
                        refreshTree();
                        vscode.window.showInformationMessage('TaskVision: Added `' + selectedKind.value + '` annotation to session `' + session.sessionId + '`.');
                    }).catch(function (error) {
                        vscode.window.showErrorMessage('TaskVision: ' + error.message);
                    });
                });
            });
        }).catch(function (error) {
            vscode.window.showErrorMessage('TaskVision: ' + error.message);
        });
    }

    function editTaskStatusInSource(node: TodoNode, newStatus: string) {
        const targetUri = node.uri ? node.uri : vscode.Uri.file(node.fsPath);

        return Promise.resolve(vscode.workspace.openTextDocument(targetUri)).then(function (document) {
            const line = document.lineAt(node.line);
            const updatedLine = utils.replaceTaskStatusInLine(line.text, node, newStatus);

            if (!updatedLine || updatedLine === line.text) {
                throw new Error('Unable to locate tag for inline status update');
            }

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, line.range, updatedLine);

            return Promise.resolve(vscode.workspace.applyEdit(edit)).then(function (applied) {
                if (!applied) {
                    throw new Error('VS Code rejected the inline status edit');
                }

                openDocuments[document.uri.toString()] = document;
                refreshFile(document);
                refreshAiStatusReports();
            });
        });
    }

    function applyInlineStatusesToTasks(tasks: TodoNode[]) {
        const candidates = (tasks || []).filter(function (task) {
            return task &&
                task.type === 'todo' &&
                isTaskAnnotationNode(task) &&
                task.actualTag &&
                task.hasExplicitStatus !== true &&
                task.isStatusNode !== true;
        });

        if (candidates.length === 0) {
            return Promise.resolve({ changed: 0, skipped: 0 });
        }

        const documentUris: Record<string, vscode.Uri> = {};
        candidates.forEach(function (task) {
            const targetUri = task.uri ? task.uri : vscode.Uri.file(task.fsPath);
            if (targetUri && targetUri.scheme === 'file') {
                documentUris[targetUri.toString()] = targetUri;
            }
        });

        return Promise.all(Object.keys(documentUris).map(function (key) {
            return vscode.workspace.openTextDocument(documentUris[key]);
        })).then(function (documents) {
            const documentsByUri: Record<string, vscode.TextDocument> = {};
            const edit = new vscode.WorkspaceEdit();
            let changed = 0;
            let skipped = 0;

            documents.forEach(function (document) {
                documentsByUri[document.uri.toString()] = document;
            });

            candidates.forEach(function (task) {
                const targetUri = task.uri ? task.uri : vscode.Uri.file(task.fsPath);
                const document = documentsByUri[targetUri.toString()];
                if (!document) {
                    skipped++;
                    return;
                }

                const line = document.lineAt(task.line);
                const updatedLine = utils.replaceTaskStatusInLine(
                    line.text,
                    task,
                    task.status || taskState.defaultStatusForTag(task.actualTag || task.tag)
                );

                if (!updatedLine || updatedLine === line.text) {
                    skipped++;
                    return;
                }

                edit.replace(document.uri, line.range, updatedLine);
                changed++;
            });

            if (changed === 0) {
                return { changed: 0, skipped: skipped };
            }

            return Promise.resolve(vscode.workspace.applyEdit(edit)).then(function (applied) {
                if (!applied) {
                    throw new Error('VS Code rejected the inline status update');
                }

                documents.forEach(function (document) {
                    openDocuments[document.uri.toString()] = document;
                    refreshFile(document);
                });
                refreshAiStatusReports();

                return {
                    changed: changed,
                    skipped: skipped
                };
            });
        });
    }

    function addMissingTaskStatuses(node?: TreeNode) {
        const tasks = node ? provider.getVisibleTodoNodes(node) : provider.getVisibleTodoNodes();

        applyInlineStatusesToTasks(tasks).then(function (result) {
            if (result.changed === 0) {
                vscode.window.showInformationMessage(nativeText('TaskVision: No visible task comments were missing inline status tokens.', 'TaskVision：当前可见任务都已有状态标记。'));
                return;
            }

            let message = nativeText('TaskVision: Added inline status tokens to ' + result.changed + ' task comment' + (result.changed === 1 ? '' : 's') + '.', 'TaskVision：已为 ' + result.changed + ' 条任务注释补充状态标记。');
            if (result.skipped > 0) {
                message += nativeText(' Skipped ' + result.skipped + '.', ' 跳过 ' + result.skipped + ' 条。');
            }
            vscode.window.showInformationMessage(message);
        }).catch(function (error) {
            vscode.window.showErrorMessage('TaskVision: ' + error.message);
        });
    }

    function setTaskStatus(node?: TreeNode) {
        const currentStatus = taskState.normaliseStatus(node && node.status) || 'todo';
        const items = taskState.STATUSES.map(function (status) {
            const detail = taskState.getStatusDetails(status);
            return {
                label: '$(' + detail.icon + ') ' + statusTitle(status),
                description: status === currentStatus ? nativeText('$(check) Current', '$(check) 当前状态') : '',
                detail: statusDetail(status, detail.description),
                value: status
            };
        });

        if (!node || node.type !== 'todo' || node.isExtraLine === true || !node.actualTag || !isTaskAnnotationNode(node)) {
            vscode.window.showWarningMessage(nativeText('TaskVision: Only primary task comments can change inline status.', 'TaskVision：只有主任务注释才能修改源码内联状态。'));
            return;
        }

        vscode.window.showQuickPick(items, {
            placeHolder: nativeText('Choose a status for ', '选择任务状态：') + (node.actualTag || node.tag)
        }).then(function (selection) {
            if (!selection || selection.value === currentStatus) {
                return;
            }

            editTaskStatusInSource(node, selection.value).catch(function (error) {
                vscode.window.showErrorMessage('TaskVision: ' + error.message);
            });
        });
    }

    function setTaskPriority(node?: TreeNode) {
        if (!node || node.type !== 'todo' || !node.taskId || !node.rootPath || !isTaskAnnotationNode(node)) {
            vscode.window.showWarningMessage(nativeText('TaskVision: Task priority can only be stored for workspace files.', 'TaskVision：任务优先级只能保存到工作区文件。'));
            return;
        }

        const currentPriority = node.priority || config.defaultTaskPriority();
        const items = taskState.PRIORITIES.map(function (priority) {
            return {
                label: priorityTitle(priority),
                description: priority === currentPriority ? nativeText('$(check) Current', '$(check) 当前优先级') : '',
                detail: priorityDetail(priority),
                value: priority
            };
        });

        vscode.window.showQuickPick(items, {
            placeHolder: nativeText('Choose a priority for ', '选择任务优先级：') + (node.actualTag || node.tag)
        }).then(function (selection) {
            if (!selection || selection.value === currentPriority) {
                return;
            }

            const updatedAt = new Date().toISOString();
            taskMetaStore.setTaskPriority(
                node.rootPath,
                node.taskId,
                selection.value,
                'user',
                updatedAt,
                config.aiContextOutputDir()
            );
            node.priority = selection.value;
            node.lastActor = 'user';
            node.updatedAt = updatedAt;
            refreshTree();
        });
    }

    function editTaskNote(node?: TreeNode) {
        if (!node || node.type !== 'todo' || !node.taskId || !node.rootPath || !isTaskAnnotationNode(node)) {
            vscode.window.showWarningMessage(nativeText('TaskVision: Task notes can only be stored for workspace files.', 'TaskVision：任务备注只能保存到工作区文件。'));
            return;
        }

        vscode.window.showInputBox({
            prompt: nativeText('Task note', '任务备注'),
            placeHolder: nativeText('Optional note or context for AI summaries', '可选备注或补充上下文，供 AI 摘要使用'),
            value: node.note || ''
        }).then(function (note) {
            if (note === undefined) {
                return;
            }

            const updatedAt = new Date().toISOString();
            taskMetaStore.setTaskNote(
                node.rootPath,
                node.taskId,
                note,
                'user',
                updatedAt,
                config.aiContextOutputDir()
            );
            node.note = note;
            node.lastActor = 'user';
            node.updatedAt = updatedAt;
            refreshTree();
        });
    }

    function filterByStatus() {
        const activeStatuses = hasActiveStatusFilter() ? (currentStatusFilter || []) : [];
        const items = taskState.STATUSES.map(function (status) {
            const detail = taskState.getStatusDetails(status);
            return {
                label: '$(' + detail.icon + ') ' + statusTitle(status),
                detail: statusDetail(status, detail.description),
                picked: activeStatuses.indexOf(status) !== -1,
                value: status
            };
        });

        vscode.window.showQuickPick(items, {
            canPickMany: true,
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: nativeText('Filter task tree by status. Leave empty to show all statuses.', '按状态筛选任务树；不选择任何状态表示显示全部。')
        }).then(function (selection) {
            if (selection === undefined) {
                return;
            }

            currentStatusFilter = selection.map(function (item) {
                return item.value;
            });
            if (currentStatusFilter.length === 0) {
                currentStatusFilter = undefined;
            }

            context.workspaceState.update('currentStatusFilter', currentStatusFilter).then(function () {
                if (currentStatusFilter) {
                    provider.filterByStatus(currentStatusFilter);
                }
                else {
                    provider.clearStatusFilter();
                }
                refreshTree();
            });
        });
    }

    function clearStatusFilter() {
        currentStatusFilter = undefined;
        context.workspaceState.update('currentStatusFilter', undefined).then(function () {
            provider.clearStatusFilter();
            refreshTree();
        });
    }

    function exportAiContext(node?: TreeNode) {
        const nodes = node ? provider.getVisibleTodoNodes(node) :
            (config.shouldRespectCurrentFiltersForAiContext() ? provider.getVisibleTodoNodes() : provider.getAllTodoNodes());
        const grouped: Record<string, TodoNode[]> = {};
        const createdPaths: string[] = [];
        let skipped = 0;
        const generatedAt = new Date().toISOString();
        const scopeLabel = buildTaskScopeLabel(node);

        nodes.forEach(function (entry) {
            const rootPath = entry.rootPath || getWorkspaceRootForFile(entry.fsPath);
            if (!rootPath) {
                skipped++;
                return;
            }

            if (!grouped[rootPath]) {
                grouped[rootPath] = [];
            }
            grouped[rootPath].push(entry);
        });

        syncRoots(Object.keys(grouped), scopeLabel, {
            actor: 'user',
            rebuildContext: false,
            updatedAt: generatedAt,
            forceStableIds: true,
            scopeNodesByRoot: grouped
        }).then(function (syncedRoots) {
            Object.keys(grouped).forEach(function (rootPath) {
                const rootNodes = syncedRoots[rootPath] || grouped[rootPath];
                const paths = aiContext.exportContextWithBaseline(
                    rootPath, scopeLabel, rootNodes, getNodesForRoot(rootPath), generatedAt, config.aiContextOutputDir()
                );
                createdPaths.push(paths.markdown);
            });

            if (createdPaths.length === 0) {
                vscode.window.showWarningMessage('TaskVision: No workspace-backed annotations were available to export.');
                return;
            }

            vscode.workspace.openTextDocument(vscode.Uri.file(createdPaths[0])).then(function (document) {
                vscode.window.showTextDocument(document, { preview: true });
            });

            if (skipped > 0) {
                vscode.window.showInformationMessage('TaskVision: Exported AI context for ' + createdPaths.length + ' workspace(s); skipped ' + skipped + ' annotation(s) outside the workspace.');
            }
        }).catch(function (error) {
            vscode.window.showErrorMessage('TaskVision: ' + error.message);
        });
    }

    function openAiStatusReport(node?: TreeNode) {
        let rootPath = node && node.rootPath ? node.rootPath : undefined;

        if (!rootPath && vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
            rootPath = getWorkspaceRootForFile(vscode.window.activeTextEditor.document.fileName);
        }

        if (!rootPath && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        if (!rootPath) {
            vscode.window.showWarningMessage('TaskVision: No workspace root is available for the AI status report.');
            return;
        }

        const reportPath = aiContext.getOutputPaths(rootPath, config.aiContextOutputDir()).report;
        if (fs.existsSync(reportPath) !== true) {
            vscode.window.showInformationMessage('TaskVision: No AI status report exists yet. Export AI context first.');
            return;
        }

        vscode.workspace.openTextDocument(vscode.Uri.file(reportPath)).then(function (document) {
            vscode.window.showTextDocument(document, { preview: true });
        });
    }

    function register() {
        function migrateSettings() {
            settingsMigration.migrateLegacySettings(vscode, context, debug).catch(function (error) {
                debug("legacy namespace migration failed: " + error.message);
            });
        }

        function showInTree(uri: vscode.Uri) {
            provider.getElement(uri.fsPath, function (element) {
                if (todoTreeView.visible === true) {
                    todoTreeView.reveal(element, { focus: false, select: true });
                }
            });
        }

        function documentChanged(document?: vscode.TextDocument) {
            if (document) {
                debug('[TaskVision] documentChanged: ' + document.fileName +
                    ' scheme=' + document.uri.scheme +
                    ' validScheme=' + config.isValidScheme(document.uri) +
                    ' included=' + isIncluded(document.uri));
                vscode.window.visibleTextEditors.map(editor => {
                    if (document === editor.document && config.isValidScheme(document.uri)) {
                        if (isIncluded(document.uri)) {
                            highlights.triggerHighlight(editor);
                        }
                    }
                });

                if (config.isValidScheme(document.uri) && path.basename(document.fileName) !== "settings.json") {
                    if (shouldRefreshFile()) {
                        clearTimeout(fileRefreshTimeout);
                        fileRefreshTimeout = setTimeout(refreshFile, 500, document);
                    }
                }
            }
            else {
                vscode.window.visibleTextEditors.map(editor => {
                    if (config.isValidScheme(editor.document.uri)) {
                        if (isIncluded(editor.document.uri)) {
                            highlights.triggerHighlight(editor);
                        }
                    }
                });
            }
        }

        function validateColours() {
            const invalidColourMessage = colours.validateColours(vscode.workspace);
            if (invalidColourMessage) {
                vscode.window.showWarningMessage("TaskVision: " + invalidColourMessage);
            }
            const invalidIconColourMessage = colours.validateIconColours(vscode.workspace);
            if (invalidIconColourMessage) {
                vscode.window.showWarningMessage("TaskVision: " + invalidIconColourMessage);
            }
        }

        function validateIcons() {
            const invalidIconMessage = icons.validateIcons(vscode.workspace);
            if (invalidIconMessage) {
                vscode.window.showWarningMessage("TaskVision: " + invalidIconMessage);
            }
        }

        function validatePlaceholders() {
            const unexpectedPlaceholders: string[] = [];
            utils.formatLabel(config.labelFormat(), {}, unexpectedPlaceholders);
            if (unexpectedPlaceholders.length > 0) {
                vscode.window.showErrorMessage("TaskVision: Unexpected placeholders (" + unexpectedPlaceholders.join(",") + ")");
            }
        }

        function shouldRefreshFile() {
            return vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('autoRefresh')! === true && config.scanMode() !== SCAN_MODE_WORKSPACE_ONLY;
        }

        // Commands should still register without ripgrep so the view never exposes dead menu items.
        if (!config.ripgrepPath()) {
            vscode.window.showErrorMessage("TaskVision: Failed to find vscode-ripgrep - please install ripgrep manually and set 'taskvision.ripgrep' to point to the executable");
        }

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.openUrl', (url: string) => {
            debug("Opening " + url);
            vscode.env.openExternal(vscode.Uri.parse(url));
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.filter', function () {
            vscode.window.showInputBox({ prompt: nativeText('Filter tree', '筛选任务树') }).then(
                function (term) {
                    currentFilter = term;
                    if (currentFilter) {
                        context.workspaceState.update('filtered', true);
                        context.workspaceState.update('currentFilter', currentFilter);
                        provider.filter(currentFilter);
                        refreshTree();
                    }
                });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.filterByStatus', filterByStatus));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.filterStatusClear', clearStatusFilter));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.stopScan', function () {
            ripgrep.kill();
            statusBarIndicator.text = "TaskVision: Scanning interrupted.";
            statusBarIndicator.tooltip = "Click to restart";
            statusBarIndicator.command = "taskvision.refresh";
            interrupted = true;
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.exportTree', function () {
            let exportPath = vscode.workspace.getConfiguration('taskvision.general').get<string>('exportPath')!;
            exportPath = utils.replaceEnvironmentVariables(exportPath);
            exportPath = utils.formatExportPath(exportPath);

            const uri = vscode.Uri.parse('todotree-export:' + exportPath);
            vscode.workspace.openTextDocument(uri).then(function (document) {
                vscode.window.showTextDocument(document, { preview: true });
            });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.exportAiContext', exportAiContext));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.openAiStatusReport', openAiStatusReport));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.syncDataModel', syncDataModel));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.addContextAnnotation', addContextAnnotation));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.startAgentSession', startAgentSession));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.writeAgentAnnotations', writeAgentAnnotations));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.addMissingTaskStatuses', addMissingTaskStatuses));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.setTaskStatus', setTaskStatus));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.setTaskPriority', setTaskPriority));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.editTaskNote', editTaskNote));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.showOnlyThisFolder', function (node: TreeNode) {
            const rootNode = tree.locateWorkspaceNode(node.fsPath);
            const includeGlobs = [utils.createFolderGlob(node.fsPath, rootNode?.fsPath || node.fsPath, "/*")];
            context.workspaceState.update('includeGlobs', includeGlobs);
            rebuild();
            dumpFolderFilter();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.showOnlyThisFolderAndSubfolders', function (node: TreeNode) {
            const rootNode = tree.locateWorkspaceNode(node.fsPath);
            const includeGlobs = [utils.createFolderGlob(node.fsPath, rootNode?.fsPath || node.fsPath, "/**/*")];
            context.workspaceState.update('includeGlobs', includeGlobs);
            rebuild();
            dumpFolderFilter();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.switchScope', function () {
            const config = vscode.workspace.getConfiguration('taskvision.filtering').get<{name: string; includeGlobs?: string | string[]; excludeGlobs?: string | string[]}[]>('scopes')!;

            if (!config || config.length === 0) {
                vscode.window.showWarningMessage("TaskVision: No scopes configured (see taskvision.filtering.scopes setting)", OPEN_SETTINGS_BUTTON, OK_BUTTON).then(function (button) {
                    if (button === OPEN_SETTINGS_BUTTON) {
                        vscode.workspace.getConfiguration('taskvision.filtering').update('scopes', [], vscode.ConfigurationTarget.Global).then(function () {
                            vscode.commands.executeCommand('workbench.action.openSettingsJson', 'taskvision.filtering.scopes');
                        });
                    }
                });
            }
            else {
                const items: vscode.QuickPickItem[] = [];
                const currentIncludeGlobs = JSON.stringify(context.workspaceState.get<string[]>('includeGlobs')! || []);
                const currentExcludeGlobs = JSON.stringify(context.workspaceState.get<string[]>('excludeGlobs')! || []);
                config.forEach(function (c) {
                    const scope: vscode.QuickPickItem = { label: c.name };
                    const includeGlobs = JSON.stringify(utils.toGlobArray(c.includeGlobs));
                    const excludeGlobs = JSON.stringify(utils.toGlobArray(c.excludeGlobs));
                    if (currentIncludeGlobs === includeGlobs && currentExcludeGlobs === excludeGlobs) {
                        scope.description = "$(check)";
                    }

                    items.push(scope);
                });
                const options = { placeHolder: "Select scope..." };
                vscode.window.showQuickPick(items, options).then(function (scope) {
                    if (scope) {
                        const currentConfig = config.find(c => c.name === scope.label);
                        if (!currentConfig) return;

                        context.workspaceState.update('includeGlobs', utils.toGlobArray(currentConfig.includeGlobs));
                        context.workspaceState.update('excludeGlobs', utils.toGlobArray(currentConfig.excludeGlobs));

                        rebuild();
                        dumpFolderFilter();
                    }
                });
            }

        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.excludeThisFolder', function (node: TreeNode) {
            const rootNode = tree.locateWorkspaceNode(node.fsPath);
            const glob = utils.createFolderGlob(node.fsPath, rootNode?.fsPath || node.fsPath, "/**/*");
            const excludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];
            if (excludeGlobs.indexOf(glob) === -1) {
                excludeGlobs.push(glob);
                context.workspaceState.update('excludeGlobs', excludeGlobs);
                rebuild();
                dumpFolderFilter();
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.excludeThisFile', function (node: TreeNode) {
            const excludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];
            if (excludeGlobs.indexOf(node.fsPath) === -1) {
                excludeGlobs.push(node.fsPath);
                context.workspaceState.update('excludeGlobs', excludeGlobs);
                rebuild();
                dumpFolderFilter();
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.removeFilter', function () {
            const CLEAR_TREE_FILTER = "Clear Tree Filter";
            const CLEAR_STATUS_FILTER = "Clear Status Filter";
            let excludeGlobs = context.workspaceState.get<string[]>('excludeGlobs')! || [];
            let includeGlobs = context.workspaceState.get<string[]>('includeGlobs')! || [];
            const choices: Record<string, {include?: string; exclude?: string}> = {};

            if (currentFilter) {
                choices[CLEAR_TREE_FILTER] = {};
            }
            if (hasActiveStatusFilter()) {
                choices[CLEAR_STATUS_FILTER] = {};
            }

            excludeGlobs.forEach(function (excludeGlob) {
                if (excludeGlob.endsWith("/**/*")) {
                    choices["Exclude Folder: " + excludeGlob.slice(0, -5)] = { exclude: excludeGlob };
                }
                else if (excludeGlob.indexOf('*') === -1) {
                    choices["Exclude File: " + excludeGlob] = { exclude: excludeGlob };
                }
                else {
                    choices["Exclude: " + excludeGlob] = { exclude: excludeGlob };
                }
            });
            includeGlobs.forEach(function (includeGlob) {
                if (includeGlob.endsWith("/**/*")) {
                    choices["Include Folder and Subfolders: " + includeGlob.slice(0, -5)] = { include: includeGlob };
                }
                else if (includeGlob.endsWith("/*")) {
                    choices["Include Folder: " + includeGlob.slice(0, -2)] = { include: includeGlob };
                }
                else {
                    choices["Include: " + includeGlob] = { include: includeGlob };
                }
            });

            vscode.window.showQuickPick(Object.keys(choices), { matchOnDetail: true, matchOnDescription: true, canPickMany: true, placeHolder: "Select filters to remove" }).then(function (selection) {
                if (selection) {
                    if (selection.indexOf(CLEAR_TREE_FILTER) !== -1) {
                        clearTreeFilter();
                        selection = selection.filter(function (choice) {
                            return choice !== CLEAR_TREE_FILTER;
                        });
                    }
                    if (selection.indexOf(CLEAR_STATUS_FILTER) !== -1) {
                        clearStatusFilter();
                        selection = selection.filter(function (choice) {
                            return choice !== CLEAR_STATUS_FILTER;
                        });
                    }

                    selection.map(function (choice) {
                        if (choices[choice].include) {
                            includeGlobs = includeGlobs.filter(f => choices[choice].include != f);
                        }
                        else if (choices[choice].exclude) {
                            excludeGlobs = excludeGlobs.filter(f => choices[choice].exclude != f);
                        }
                    });

                    context.workspaceState.update('includeGlobs', includeGlobs);
                    context.workspaceState.update('excludeGlobs', excludeGlobs);

                    rebuild();
                    dumpFolderFilter();
                }
            });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.resetCache', function () {
            function purgeFolder(folder: string | undefined) {
                if (!folder || fs.existsSync(folder) !== true) {
                    return;
                }

                try {
                    fs.readdirSync(folder).forEach(function (file) {
                        const target = path.join(folder, file);
                        if (fs.lstatSync(target).isFile()) {
                            fs.unlinkSync(target);
                        }
                    });
                }
                catch (e) {
                    debug("Failed to purge cache folder '" + folder + "': " + errorMessage(e));
                }
            }

            context.workspaceState.update('includeGlobs', []);
            context.workspaceState.update('excludeGlobs', []);
            context.workspaceState.update('expandedNodes', {});
            context.workspaceState.update('submoduleExcludeGlobs', []);
            context.workspaceState.update('buildCounter', undefined);
            context.workspaceState.update('currentFilter', undefined);
            context.workspaceState.update('currentStatusFilter', undefined);
            context.workspaceState.update('filtered', undefined);
            context.workspaceState.update('tagsOnly', undefined);
            context.workspaceState.update('flat', undefined);
            context.workspaceState.update('expanded', undefined);
            context.workspaceState.update('groupedByTag', undefined);
            context.workspaceState.update('groupedBySubTag', undefined);
            context.globalState.update('migratedVersion', undefined);
            context.globalState.update('ignoreMarkdownUpdate', undefined);

            currentFilter = undefined;
            currentStatusFilter = undefined;
            purgeFolder(context.storageUri && context.storageUri.fsPath);
            purgeFolder(context.globalStorageUri && context.globalStorageUri.fsPath);
            taskMetaStore.resetCache();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.resetAllFilters', function () {
            context.workspaceState.update('includeGlobs', []);
            context.workspaceState.update('excludeGlobs', []);
            rebuild();
            dumpFolderFilter();
            clearTreeFilter();
            clearStatusFilter();
        }));

        registerAppearanceCommands(context);

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.reveal', function () {
            if (vscode.window.activeTextEditor) {
                showInTree(vscode.window.activeTextEditor.document.uri);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.toggleItemCounts', function () {
            const current = vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('showCountsInTree')!;
            vscode.workspace.getConfiguration('taskvision.tree').update('showCountsInTree', !current, vscode.ConfigurationTarget.Workspace);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.toggleBadges', function () {
            const current = vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('showBadges')!;
            vscode.workspace.getConfiguration('taskvision.tree').update('showBadges', !current, vscode.ConfigurationTarget.Workspace);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.toggleCompactFolders', function () {
            const current = vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('disableCompactFolders')!;
            vscode.workspace.getConfiguration('taskvision.tree').update('disableCompactFolders', !current, vscode.ConfigurationTarget.Workspace);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.goToNext', function () {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                return;
            }

            const text = editor.document.getText();
            const regex = utils.getRegexForEditorSearch(false);

            const newSelections: vscode.Selection[] = [];
            let ok = true;

            editor.selections.map(function (selection) {
                let cursorOffset = editor.document.offsetAt(selection.start);
                let textToSearch = text.substring(cursorOffset);
                let matches = textToSearch.match(regex);

                if (matches && matches.length && matches.index === 0) {
                    cursorOffset += matches[0].length;
                    textToSearch = text.substring(cursorOffset);
                    matches = textToSearch.match(regex);
                }

                if (matches && matches.length && matches.index !== undefined) {
                    let offset = cursorOffset + matches.index;
                    if (matches[0][0] === '\n') {
                        ++offset;
                    }
                    const newPosition = editor.document.positionAt(offset);
                    newSelections.push(new vscode.Selection(newPosition, newPosition));
                }
                else {
                    ok = false;
                }
            });

            if (ok && newSelections.length > 0) {
                editor.selections = newSelections;

                editor.revealRange(new vscode.Range(newSelections[0].start, newSelections[0].start));
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.goToPrevious', function () {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                return;
            }

            const text = editor.document.getText();

            const newSelections: vscode.Selection[] = [];
            let ok = true;

            editor.selections.map(function (selection) {
                const cursorOffset = editor.document.offsetAt(selection.start);
                const textToSearch = text.substring(0, cursorOffset);

                const regex = utils.getRegexForEditorSearch(true);

                let lastMatch;
                let lastMatchOffset = -1;

                let result;
                while (result = regex.exec(textToSearch)) {
                    lastMatch = result;
                    lastMatchOffset = result.index;
                }

                if (lastMatch && lastMatchOffset !== -1) {
                    if (lastMatch[0][0] === '\n') {
                        ++lastMatchOffset;
                    }
                    const newPosition = editor.document.positionAt(lastMatchOffset);
                    newSelections.push(new vscode.Selection(newPosition, newPosition));
                }
                else {
                    ok = false;
                }
            });

            if (ok && newSelections.length > 0) {
                editor.selections = newSelections;

                editor.revealRange(new vscode.Range(newSelections[0].start, newSelections[0].start));
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.revealInFile', function (uri: vscode.Uri, selection: vscode.TextDocumentShowOptions) {
            function flashLine() {
                const editor = vscode.window.activeTextEditor;

                if (!editor) return;
                const currentLineRange = editor.document.lineAt(editor.selection.active.line).range;

                const decorationOptions: vscode.DecorationRenderOptions = {
                    isWholeLine: true,
                };

                const flashBackgroundColour = new vscode.ThemeColor('editor.rangeHighlightBackground');

                decorationOptions.light = { backgroundColor: flashBackgroundColour };
                decorationOptions.dark = { backgroundColor: flashBackgroundColour };

                const lineFlashStyle = vscode.window.createTextEditorDecorationType(decorationOptions);

                const lineRangeHighlight = { range: currentLineRange };

                editor.setDecorations(lineFlashStyle, [lineRangeHighlight]);

                setTimeout(function () {
                    editor.setDecorations(lineFlashStyle, []);
                }, 150);
            }
            vscode.commands.executeCommand('vscode.open', uri, selection).then(
                flashLine
            );
        }));

        context.subscriptions.push(todoTreeView.onDidExpandElement(function (e) { provider.setExpanded(e.element.fsPath, true); }));
        context.subscriptions.push(todoTreeView.onDidCollapseElement(function (e) { provider.setExpanded(e.element.fsPath, false); }));

        context.subscriptions.push(vscode.commands.registerCommand('taskvision.filterClear', clearTreeFilter));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.refresh', rebuild));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.showFlatView', showFlatView));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.showTagsOnlyView', showTagsOnlyView));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.showTreeView', showTreeView));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.expand', expand));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.collapse', collapse));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.groupByTag', groupByTag));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.ungroupByTag', ungroupByTag));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.groupBySubTag', groupBySubTag));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.ungroupBySubTag', ungroupBySubTag));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.addTag', addTagDialog));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.removeTag', removeTagDialog));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.onStatusBarClicked', onStatusBarClicked));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.scanWorkspaceAndOpenFiles', scanWorkspaceAndOpenFiles));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.scanOpenFilesOnly', scanOpenFilesOnly));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.scanCurrentFileOnly', scanCurrentFileOnly));
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.scanWorkspaceOnly', scanWorkspaceOnly));

        context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(function (editors) {
            editors.forEach(function (editor) {
                if (editor.document && config.isValidScheme(editor.document.uri) && isIncluded(editor.document.uri)) {
                    highlights.triggerHighlight(editor);
                }
            });
        }));

        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(function (e) {
            if (e && e.document) {
                openDocuments[e.document.uri.toString()] = e.document;

                if (config.scanMode() === SCAN_MODE_CURRENT_FILE && isIncluded(e.document.uri)) {
                    provider.clear(vscode.workspace.workspaceFolders);
                    refreshFile(e.document);
                }

                if (vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('autoRefresh')! === true && vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('trackFile')! === true) {
                    if (e.document.uri && config.isValidScheme(e.document.uri)) {
                        if (selectedDocument !== e.document.fileName) {
                            setTimeout(showInTree, 500, e.document.uri);
                        }
                        selectedDocument = undefined;
                    }
                }

                if (e.document.fileName === undefined || isIncluded(e.document.uri)) {
                    updateInformation();
                }

                documentChanged(e.document);
            }
        }));

        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
            if (config.isValidScheme(document.uri) && path.basename(document.fileName) !== "settings.json") {
                if (shouldRefreshFile()) {
                    refreshFile(document);
                }
            }
        }));

        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => {
            if (shouldRefreshFile()) {
                if (config.isValidScheme(document.uri)) {
                    openDocuments[document.uri.toString()] = document;
                    refreshFile(document);
                }
            }
        }));

        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
            function removeFromTree(uri: vscode.Uri) {
                searchResults.remove(uri);
                provider.remove(function () {
                    refreshTree();
                    updateInformation();
                }, uri);
            }

            delete openDocuments[document.uri.toString()];

            if (vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('autoRefresh')! === true && config.scanMode() !== SCAN_MODE_WORKSPACE_ONLY) {
                if (config.isValidScheme(document.uri)) {
                    if (config.scanMode() !== SCAN_MODE_WORKSPACE_AND_OPEN_FILES) {
                        removeFromTree(document.uri);
                    }
                    else {
                        let keep = false;
                        const tempSearchList = getRootFolders() || [];

                        if (tempSearchList.length === 0) {
                            searchWorkspaces(tempSearchList);
                        }

                        tempSearchList.map(function (p) {
                            if (document.fileName === p || document.fileName.indexOf(p + path.sep) === 0) {
                                keep = true;
                            }
                        });
                        if (!keep) {
                            removeFromTree(document.uri);
                        }
                    }
                }
            }
        }));

        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
            if (e.affectsConfiguration("taskvision") ||
                e.affectsConfiguration('files.exclude') ||
                e.affectsConfiguration('explorer.compactFolders')) {
                if (e.affectsConfiguration("taskvision.highlights.enabled") ||
                    e.affectsConfiguration("taskvision.highlights.useColourScheme") ||
                    e.affectsConfiguration("taskvision.highlights.foregroundColourScheme") ||
                    e.affectsConfiguration("taskvision.highlights.backgroundColourScheme") ||
                    e.affectsConfiguration("taskvision.highlights.opacity") ||
                    e.affectsConfiguration("taskvision.highlights.foregroundOpacity") ||
                    e.affectsConfiguration("taskvision.highlights.glowOpacity") ||
                    e.affectsConfiguration("taskvision.highlights.glassOpacity") ||
                    e.affectsConfiguration("taskvision.highlights.glassBorderOpacity") ||
                    e.affectsConfiguration("taskvision.highlights.defaultHighlight") ||
                    e.affectsConfiguration("taskvision.highlights.customHighlight")) {
                    highlights.clearCache();
                    validateColours();
                    validateIcons();
                    // triggerHighlightAll
                    vscode.window.visibleTextEditors.forEach(function (editor) {
                        highlights.triggerHighlight(editor);
                    });
                    documentChanged(); // Keeps updating the active one, though loop covers it too. Checking if documentChanged does more.
                }
                else if (e.affectsConfiguration("taskvision.tree.labelFormat")) {
                    validatePlaceholders();
                }
                else if (e.affectsConfiguration("taskvision.general.debug")) {
                    resetOutputChannel();
                }
                else if (e.affectsConfiguration("taskvision.general.automaticGitRefreshInterval")) {
                    resetGitWatcher();
                }
                else if (e.affectsConfiguration("taskvision.general.periodicRefreshInterval")) {
                    resetPeriodicRefresh();
                }

                if (e.affectsConfiguration("taskvision.general.tagGroups")) {
                    highlights.clearCache();
                    config.refreshTagGroupLookup();
                    rebuild();
                    documentChanged();
                }
                else if (e.affectsConfiguration("taskvision.tree.showCountsInTree") ||
                    e.affectsConfiguration("taskvision.tree.showBadges")) {
                    refresh();
                }
                else if (e.affectsConfiguration("taskvision.filtering") ||
                    e.affectsConfiguration("taskvision.regex") ||
                    e.affectsConfiguration("taskvision.ripgrep") ||
                    e.affectsConfiguration("taskvision.tree") ||
                    e.affectsConfiguration("taskvision.general.rootFolder") ||
                    e.affectsConfiguration("taskvision.general.tags") ||
                    e.affectsConfiguration("files.exclude")) {
                    highlights.clearCache();
                    rebuild();
                    documentChanged();
                }
                else if (e.affectsConfiguration("taskvision.general.showActivityBarBadge")) {
                    updateInformation();
                }
                else {
                    refresh();
                }

                setButtonsAndContext();
            }
        }));

        context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(function () {
            provider.clear(vscode.workspace.workspaceFolders);
            provider.rebuild();
            rebuild();
        }));

        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(function (e) {
            documentChanged(e.document);
        }));

        // The channel is optional and can be recreated after configuration changes.
        context.subscriptions.push({ dispose: function () {
            if (outputChannel) { outputChannel.dispose(); outputChannel = undefined; }
        } });

        resetOutputChannel();

        migrateSettings();
        validateColours();
        validateIcons();
        validatePlaceholders();
        setButtonsAndContext();
        resetGitWatcher();
        resetPeriodicRefresh();

        if (vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('scanAtStartup')! === true) {
            rebuild();

            const editors = vscode.window.visibleTextEditors;
            editors.map(function (editor) {
                if (editor.document && config.isValidScheme(editor.document.uri)) {
                    openDocuments[editor.document.uri.toString()] = editor.document;
                }
                refreshOpenFiles();
            });

            if (vscode.window.activeTextEditor) {
                documentChanged(vscode.window.activeTextEditor.document);
            }
        }
        else {
            todoTreeView.message = "Click the refresh button to scan...";
        }
    }

    register();
}

function deactivate() {
    ripgrep.kill();
    provider.clear([]);
}

export { activate, deactivate };
