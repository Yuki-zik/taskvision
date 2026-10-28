import type {TreeNode, TodoNode, PathNode, SearchResult, ExtractedTag, ExportTree, Logger} from './model';
import {present} from './validation';
// REUSE: 复用现有目录／标签分组和源码定位，知识标签继续使用同一棵树。 [tv:id=reuse.tree]

import * as vscode from 'vscode';
import * as path from 'path';

import * as utils from './utils.js';
import * as icons from './icons.js';
import * as config from './config.js';
import * as taskState from './taskState.js';
import * as taskMetaStore from './taskMetaStore.js';

let workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
let nodes: TreeNode[] = [];
let currentFilter: string | undefined;
let currentStatusFilter: string[] | undefined;

const PATH = "path";
const TODO = "todo";

let buildCounter = 1;
let nodeCounter = 1;

let expandedNodes: Record<string, boolean> = {};

let treeHasSubTags = false;
const DEFAULT_LABEL_FORMAT = "${tag} ${after}";

const isVisible = function(e: TreeNode) {
    return e.visible === true && e.hidden !== true;
};

const isTodoNode = function(e: TreeNode): e is TodoNode {
    return e.type === TODO;
};

const isTaskAnnotationNode = function(e: TreeNode) {
    return isTodoNode(e) && e.annotationKind !== 'context' && e.annotationKind !== 'review';
};

const isContextAnnotationNode = function(e: TreeNode) {
    return isTodoNode(e) && e.annotationKind === 'context';
};

const isReviewAnnotationNode = function(e: TreeNode) {
    return isTodoNode(e) && e.annotationKind === 'review';
};

const isPathNode = function(e: TreeNode): e is PathNode {
    return e.type === PATH;
};

const findTagNode = function(this: string, node: TreeNode) {
    if (config.isRegexCaseSensitive()) {
        return isPathNode(node) && node.tag === this.toString();
    }
    return isPathNode(node) && node.tag && node.tag.toLowerCase() === this.toString().toLowerCase();
};

const findSubTagNode = function(this: string, node: TreeNode) {
    if (config.isRegexCaseSensitive()) {
        return node.type === PATH && node.subTag === this.toString();
    }
    return node.type === PATH && node.subTag && node.subTag.toLowerCase() === this.toString().toLowerCase();
};

const findExactPath = function(this: string, node: TreeNode) {
    return isPathNode(node) && node.fsPath === this.toString();
};

const findPathNode = function(this: string, node: TreeNode) {
    return isPathNode(node) && node.pathElement === this.toString();
};

const findTodoNode = function(this: TreeNode, node: TreeNode) {
    return isTodoNode(node) && node.label === this.label.toString() && node.fsPath === this.fsPath && node.line === this.line;
};

const sortFoldersFirst = function(a: TreeNode, b: TreeNode, same: (a: TreeNode, b: TreeNode) => number) {
    if (a.isFolder === b.isFolder) {
        return same(a, b);
    }
    else {
        return b.isFolder ? 1 : -1;
    }
};

const sortByLineAndColumn = function(a: TreeNode, b: TreeNode) {
    return (a.line ?? Number.NaN) > (b.line ?? Number.NaN) ? 1 : (b.line ?? Number.NaN) > (a.line ?? Number.NaN) ? -1 : (a.column ?? Number.NaN) > (b.column ?? Number.NaN) ? 1 : -1;
};

const sortByFilenameAndLine = function(a: TreeNode, b: TreeNode) {
    return sortFoldersFirst(a, b, function (a, b) {
        if (a.isRootTagNode === true && b.isRootTagNode === true) {
            const tags = config.tags();
            return tags.indexOf(a.tag || '') > tags.indexOf(b.tag || '') ? 1 : tags.indexOf(b.tag || '') > tags.indexOf(a.tag || '') ? -1 : sortByLineAndColumn(a, b);
        }
        return a.fsPath > b.fsPath ? 1 : b.fsPath > a.fsPath ? -1 : sortByLineAndColumn(a, b);
    });
};

const sortTagsOnlyViewByLabel = function(a: TreeNode, b: TreeNode) {
    return sortFoldersFirst(a, b, function (a, b) { return a.label > b.label ? 1 : b.label > a.label ? -1 : sortByLineAndColumn(a, b); });
};

const sortTagsOnlyViewByTagOrder = function(a: TreeNode, b: TreeNode) {
    return sortFoldersFirst(a, b, function (a, b) {
        const tags = config.tags();
        const indexA = tags.indexOf(a.tag || '');
        const indexB = tags.indexOf(b.tag || '');
        return indexA > indexB ? 1 : (indexB > indexA ? -1 : sortByFilenameAndLine(a, b));
    });
};

function createWorkspaceRootNode(folder: vscode.WorkspaceFolder): TreeNode {
    const id = (buildCounter * 1000000) + nodeCounter++;
    const node = {
        isWorkspaceNode: true,
        type: PATH,
        label: folder.uri.scheme === 'file' ? folder.name : folder.uri.authority,
        nodes: [],
        fsPath: folder.uri.scheme === 'file' ? folder.uri.fsPath : (folder.uri.authority + folder.uri.fsPath),
        id: id,
        visible: true,
        isFolder: true
    };
    return node;
}

function createPathNode(folder: string, pathElements: string[], isFolder: boolean | string | undefined, subTag?: string): TreeNode {
    const id = (buildCounter * 1000000) + nodeCounter++;
    const fsPath = pathElements.length > 0 ? path.join(folder, pathElements.join(path.sep)) : folder;

    return {
        type: PATH,
        fsPath: fsPath,
        pathElement: pathElements[pathElements.length - 1],
        label: pathElements[pathElements.length - 1],
        nodes: [],
        id: id,
        visible: true,
        isFolder: isFolder,
        subTag: subTag
    };
}

function createFlatNode(fsPath: string, rootNode?: TreeNode): TreeNode {
    const id = (buildCounter * 1000000) + nodeCounter++;
    const pathLabel = path.dirname(rootNode === undefined ? fsPath : path.relative(rootNode.fsPath, fsPath));

    return {
        type: PATH,
        fsPath: fsPath,
        label: path.basename(fsPath),
        pathLabel: pathLabel === '.' ? '' : '(' + pathLabel + ')',
        nodes: [],
        id: id,
        visible: true
    };
}

function createTagNode(fsPath: string, tag: string): TreeNode {
    const id = (buildCounter * 1000000) + nodeCounter++;

    return {
        isRootTagNode: true,
        type: PATH,
        label: tag,
        fsPath: fsPath,
        nodes: [],
        id: id,
        tag: tag,
        visible: true
    };
}

function createSubTagNode(subTag: string): TreeNode {
    const id = (buildCounter * 1000000) + nodeCounter++;

    return {
        isRootTagNode: true,
        type: PATH,
        label: subTag,
        fsPath: subTag,
        nodes: [],
        id: id,
        subTag: subTag,
        visible: true,
        isFolder: true
    };
}

function getWorkspaceRootForFile(filename: string) {
    let result: string | undefined;

    (workspaceFolders || []).forEach(function (folder) {
        if (!folder.uri || folder.uri.scheme !== 'file') {
            return;
        }

        const folderPath = folder.uri.fsPath;
        const relative = path.relative(folderPath, filename);
        if (relative === '' || (relative && relative.indexOf('..') !== 0 && path.isAbsolute(relative) === false)) {
            if (!result || folderPath.length > result.length) {
                result = folderPath;
            }
        }
    });

    return result;
}

function buildTodoLabel(extracted: ExtractedTag, result: SearchResult) {
    let label = (extracted.withoutTag && extracted.withoutTag.length > 0) ? extracted.withoutTag : "line " + result.line;

    if (config.shouldGroupByTag() !== true) {
        if (result.extraLines) {
            label = extracted.tag;
        }
        else {
            label = extracted.tag + " " + label;
        }
    }

    return label;
}

// Semantic knowledge tags do not automatically become an "idea" task.
// Keep the status prefix for explicit inline statuses or real TODO tasks.
const KNOWLEDGE_MARKERS = new Set(['CORE', 'REUSE', 'INTENT', 'REVIEW']);
function hasDisplayTaskStatus(node: TreeNode): boolean {
    if (!node.status) return false;
    if (isTodoNode(node) &&
        KNOWLEDGE_MARKERS.has(String(node.actualTag || node.tag || '').toUpperCase()) &&
        node.hasExplicitStatus !== true && node.status === 'idea') return false;
    return true;
}

function renderTodoDisplayLabel(node: TreeNode) {
    if (isContextAnnotationNode(node)) {
        return "[ctx:" + (node.contextKind || 'context') + "] " + (node.after || node.label) + (node.pathLabel ? (" " + node.pathLabel) : "");
    }

    if (isReviewAnnotationNode(node)) {
        return "[review:" + (node.reviewKind || 'note') + "] " + (node.after || node.label) + (node.pathLabel ? (" " + node.pathLabel) : "");
    }

    let label = node.label;
    const format = config.labelFormat();

    if (format !== "" && (node.extraLines === undefined || node.extraLines.length === 0)) {
        label = utils.formatLabel(format, node);
        if (config.shouldShowStatusPrefix() &&
            hasDisplayTaskStatus(node) &&
            format.indexOf("${status}") === -1 &&
            format === DEFAULT_LABEL_FORMAT) {
            label = "[" + node.status + "] " + label;
        }
    }
    else if (config.shouldShowStatusPrefix() && hasDisplayTaskStatus(node) && node.isExtraLine !== true) {
        label = "[" + node.status + "] " + label;
    }

    return label + (node.pathLabel ? (" " + node.pathLabel) : "");
}

function shortStableId(stableId?: string) {
    if (!stableId) {
        return '';
    }

    const parts = String(stableId).split('.');
    if (parts.length >= 3) {
        return parts[0] + '.' + parts[parts.length - 1];
    }

    return String(stableId);
}

function shortSessionId(sessionId?: string) {
    if (!sessionId) {
        return '';
    }

    const parts = String(sessionId).split('.');
    if (parts.length >= 4) {
        return parts[2] + '.' + parts[3];
    }

    return String(sessionId);
}

function getAnnotationIcon(node: TreeNode) {
    if (isContextAnnotationNode(node)) {
        return new vscode.ThemeIcon('note');
    }

    if (isReviewAnnotationNode(node)) {
        switch (node.reviewKind) {
            case 'verify':
                return new vscode.ThemeIcon('beaker');
            case 'risk':
                return new vscode.ThemeIcon('warning');
            case 'blocked':
                return new vscode.ThemeIcon('debug-pause');
            case 'changed':
                return new vscode.ThemeIcon('diff');
            case 'why':
                return new vscode.ThemeIcon('info');
            case 'followup':
            default:
                return new vscode.ThemeIcon('comment');
        }
    }

    return undefined;
}

function getAnnotationDescription(node: TreeNode) {
    if (isTaskAnnotationNode(node)) {
        if (Array.isArray(node.contextRefs) && node.contextRefs.length > 0) {
            return 'ctx:' + node.contextRefs.length;
        }

        return shortStableId(node.stableId);
    }

    if (isContextAnnotationNode(node)) {
        return (Array.isArray(node.taskRefs) && node.taskRefs.length > 0) ? ('task:' + node.taskRefs.length) : 'ctx';
    }

    if (isReviewAnnotationNode(node)) {
        return shortSessionId(node.sessionId);
    }

    return undefined;
}

function getAnnotationTooltip(node: TreeNode) {
    if (isTaskAnnotationNode(node)) {
        return utils.formatLabel(config.tooltipFormat(), node) + (node.stableId ? ("\nStable ID: " + node.stableId) : '');
    }

    if (isContextAnnotationNode(node)) {
        return [
            'Context: ' + (node.contextKind || 'context'),
            node.stableId ? ('Stable ID: ' + node.stableId) : '',
            node.taskRefs && node.taskRefs.length > 0 ? ('Task refs: ' + node.taskRefs.join(', ')) : '',
            node.after || node.label || ''
        ].filter(present).join('\n');
    }

    if (isReviewAnnotationNode(node)) {
        return [
            'Review: ' + (node.reviewKind || 'note'),
            node.sessionId ? ('Session: ' + node.sessionId) : '',
            node.taskRefs && node.taskRefs.length > 0 ? ('Task refs: ' + node.taskRefs.join(', ')) : '',
            node.after || node.label || ''
        ].filter(present).join('\n');
    }

    return undefined;
}

function createTodoNode(result: SearchResult, rootNode?: TreeNode): TodoNode {
    const id = (buildCounter * 1000000) + nodeCounter++;
    let joined = result.match.substr(result.column - 1);
    if (result.extraLines) {
        result.extraLines.map(function (extraLine) {
            joined += "\n" + extraLine.match;
        });
    }
    const text = utils.removeBlockComments(joined, result.uri.fsPath);
    const extracted = utils.extractTag(text, result.column);
    const label = buildTodoLabel(extracted, result);

    const tagGroup = config.tagGroup(extracted.tag);
    const rootPath = getWorkspaceRootForFile(result.uri.fsPath) || (rootNode && rootNode.fsPath ? rootNode.fsPath : undefined);
    let taskId: string | undefined = utils.createTaskId(rootPath, result.uri.fsPath, extracted.tag, extracted.withoutTag, extracted.subTag);
    const meta = taskMetaStore.getTaskMetadata(rootPath, taskId, config.defaultTaskPriority(), config.aiContextOutputDir());
    const annotationKind = extracted.annotationKind || 'task';
    let stableId = extracted.stableId;
    let contextRefs: string[] = [];
    let priority: string | undefined = meta.priority;
    let note = meta.note;
    let lastActor = meta.lastActor;
    let updatedAt = meta.updatedAt;

    if (annotationKind === 'task') {
        stableId = stableId || meta.stableId || utils.createTaskStableId(rootPath, result.uri.fsPath, extracted.tag, extracted.after || extracted.withoutTag, extracted.subTag);
        contextRefs = meta.contextRefs || [];
    }
    else if (annotationKind === 'context') {
        stableId = stableId || utils.createContextStableId(rootPath, result.uri.fsPath, extracted.after || extracted.withoutTag, extracted.contextKind, result.line);
        priority = undefined;
        note = '';
        lastActor = undefined;
        updatedAt = undefined;
        taskId = undefined;
    }
    else if (annotationKind === 'review') {
        stableId = stableId || utils.createContextStableId(rootPath, result.uri.fsPath, extracted.after || extracted.withoutTag, extracted.reviewKind || 'review', result.line);
        priority = undefined;
        note = '';
        lastActor = undefined;
        updatedAt = undefined;
        taskId = undefined;
    }

    const todo: TodoNode = {
        type: TODO,
        fsPath: result.uri.fsPath,
        uri: result.uri,
        label: label,
        tag: tagGroup ? tagGroup : extracted.tag,
        subTag: extracted.subTag,
        actualTag: extracted.tag,
        line: result.line - 1,
        column: result.column,
        endColumn: result.column + result.match.length,
        after: extracted.after ? extracted.after.trim() : "",
        before: extracted.before ? extracted.before.trim() : "",
        id: id,
        visible: true,
        extraLines: [],
        status: extracted.status,
        hasExplicitStatus: extracted.hasExplicitStatus === true,
        priority: priority,
        note: note,
        lastActor: lastActor,
        updatedAt: updatedAt,
        taskId: taskId,
        rootPath: rootPath,
        sourceOfTruth: extracted.sourceOfTruth || 'inline',
        stableId: stableId,
        explicitStableId: extracted.stableId,
        annotationKind: annotationKind,
        contextKind: extracted.contextKind,
        reviewKind: extracted.reviewKind,
        sessionId: extracted.sessionId,
        taskRefs: extracted.taskRefs || [],
        contextRefs: contextRefs,
        tvDirectives: extracted.tvDirectives || {}
    };

    if (result.extraLines) {
        const commentsRemoved = text.split('\n');
        commentsRemoved.shift();
        result.extraLines.map(function (extraLine, index) {
            extraLine.match = commentsRemoved[index];
            extraLine.uri = result.uri;
            if (extraLine.match) {
                const extraLineMatch = extraLine.match.trim();
                if (extraLineMatch && extraLineMatch != todo.tag) {
                    const extraLineNode = createTodoNode(extraLine, rootNode);
                    extraLineNode.isExtraLine = true;
                    todo.extraLines.push(extraLineNode);
                }
            }
        });
    }

    return todo;
}

function locateWorkspaceNode(filename: string) {
    let result: TreeNode | undefined;
    nodes.map(function (node) {
        const workspacePath = node.fsPath + (node.fsPath.indexOf(path.sep) === node.fsPath.length - 1 ? "" : path.sep);
        if (node.isWorkspaceNode && (filename === node.fsPath || filename.indexOf(workspacePath) === 0)) {
            result = node;
        }
    });
    return result;
}

function locateFlatChildNode(rootNode: TreeNode | undefined, result: SearchResult, tag: string, subTag?: string) {
    let parentNodes = rootNode?.nodes || nodes;
    let parentNode;

    if (config.shouldGroupByTag() && tag) {
        const tagPath = tag;
        parentNode = parentNodes.find(findTagNode, tagPath);
        if (parentNode === undefined) {
            parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [tagPath], subTag);
            parentNode.tag = tagPath;
            parentNode.isRootTagNode = true;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes || [];
    }
    else if (config.shouldGroupBySubTag() && subTag) {
        const subTagPath = subTag;
        parentNode = parentNodes.find(findSubTagNode, subTagPath);
        if (parentNode === undefined) {
            parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [subTagPath], subTag);
            parentNode.subTag = subTagPath;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes || [];
    }

    const fullPath = result.uri.scheme === 'file' ? result.uri.fsPath : path.join(result.uri.authority, result.uri.fsPath);
    const nodePath = subTag ? path.join(fullPath, subTag) : fullPath;
    let childNode = parentNodes.find(findExactPath, nodePath);
    if (childNode === undefined) {
        childNode = createFlatNode(nodePath, rootNode);
        parentNodes.push(childNode);
    }

    return childNode;
}

function locateTreeChildNode(rootNode: TreeNode, pathElements: string[], tag: string, subTag?: string) {
    let childNode: TreeNode | undefined;

    let parentNodes = rootNode.nodes || [];
    let parentNode;

    if (config.shouldGroupByTag() && tag) {
        parentNode = parentNodes.find(findTagNode, tag);
        if (parentNode === undefined) {
            const tagPathList = [];
            if (subTag) {
                tagPathList.push(subTag);
            }
            tagPathList.push(tag);
            parentNode = createPathNode(rootNode ? rootNode.fsPath : '', tagPathList, subTag);
            parentNode.isRootTagNode = true;
            parentNode.tag = tag;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes || [];
    }
    else if (config.shouldGroupBySubTag() && subTag) {
        parentNode = parentNodes.find(findSubTagNode, subTag);
        if (parentNode === undefined) {
            const subTagPathList = [];
            subTagPathList.push(subTag);
            parentNode = createPathNode(rootNode ? rootNode.fsPath : '', subTagPathList, subTag);
            parentNode.subTag = subTag;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes || [];
    }

    pathElements.map(function (element, level) {
        childNode = parentNodes.find(findPathNode, element);
        if (childNode === undefined) {
            childNode = createPathNode(rootNode.fsPath, pathElements.slice(0, level + 1), level < pathElements.length - 1, subTag);
            parentNodes.push(childNode);
            parentNodes = childNode.nodes || [];
        }
        else {
            parentNodes = childNode.nodes || [];
        }
    });

    return childNode;
}

function countTags(child: TreeNode, tagCounts: Record<string, number>, forStatusBar: boolean, fileFilter?: string) {
    function countTag(node: TreeNode) {
        if (isTaskAnnotationNode(node)) {
            const tag = node.tag ? node.tag : "TODO";
            if (isVisible(node) && (!fileFilter || fileFilter === node.fsPath)) {
                let hide = false;

                if (forStatusBar && config.shouldHideFromStatusBar(tag)) {
                    hide = true;
                }

                if (!forStatusBar && config.shouldHideFromActivityBar(tag)) {
                    hide = true;
                }

                if (!hide) {
                    tagCounts[tag] = tagCounts[tag] === undefined ? 1 : tagCounts[tag] + 1;
                }
            }
        }
    }

    countTag(child);

    if (child.nodes !== undefined) {
        countChildTags(child.nodes.filter(isPathNode), tagCounts, forStatusBar, fileFilter);
        child.nodes.filter(isTodoNode).map(function (node) { countTag(node); });
    }
}

function countChildTags(children: TreeNode[], tagCounts: Record<string, number>, forStatusBar: boolean, fileFilter?: string) {
    children.map(function (child) { return countTags(child, tagCounts, forStatusBar, fileFilter); });
    return tagCounts;
}

function buildSessionStatusNode(context: vscode.ExtensionContext) {
    const sessions = context.workspaceState.get<Record<string, string>>('currentAgentSessions', {});
    const roots = Object.keys(sessions || {}).filter(function (rootPath) {
        return sessions[rootPath];
    });

    if (roots.length === 0) {
        return undefined;
    }

    const tooltip = roots.map(function (rootPath) {
        return path.basename(rootPath) + ': ' + sessions[rootPath];
    }).join('\n');

    if (roots.length === 1) {
        return statusNode({
            label: "Agent session: " + shortSessionId(sessions[roots[0]]),
            tooltip: tooltip,
            notExported: true,
            isStatusNode: true,
            icon: "debug-start"
        });
    }

    return statusNode({
        label: "Agent sessions: " + roots.length + " active",
        tooltip: tooltip,
        notExported: true,
        isStatusNode: true,
        icon: "debug-start"
    });
}

function normaliseStatusFilter(statuses: unknown) {
    if (!Array.isArray(statuses)) {
        return undefined;
    }

    const normalised = statuses.map(function (status) {
        return taskState.normaliseStatus(status);
    }).filter(present);

    if (normalised.length === 0) {
        return undefined;
    }

    return Array.from(new Set(normalised));
}

function addWorkspaceFolders() {
    if (workspaceFolders && config.shouldShowTagsOnly() === false) {
        workspaceFolders.map(function (folder) {
            nodes.push(createWorkspaceRootNode(folder));
        });
    }
}

class TaskTreeItem extends vscode.TreeItem { fsPath?: string; node?: TreeNode }

function statusNode(value: Pick<TreeNode, "label"> & Partial<TreeNode>): TreeNode {
    return {fsPath: '', type: 'status', visible: true, ...value};
}

class TreeNodeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _debug: Logger;
    private onTreeRefreshed: () => void;
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | void>;
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | void>;
    private nodesToGet: number;
    constructor(_context: vscode.ExtensionContext, debug: Logger, onTreeRefreshed: () => void) {
        this._context = _context;
        this._debug = debug;
        this.onTreeRefreshed = onTreeRefreshed;

        this._onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.nodesToGet = 0;

        buildCounter = _context.workspaceState.get('buildCounter', 1);
        expandedNodes = _context.workspaceState.get('expandedNodes', {});
    }

    dispose() {
        if (this._onDidChangeTreeData) {
            this._onDidChangeTreeData.dispose();

        }
    }

    getChildren(node?: TreeNode): TreeNode[] {
        if (node === undefined) {
            let result: TreeNode[] = [];

            const availableNodes = nodes.filter(function (this: TreeNodeProvider, node) {
                return node.nodes === undefined || (node.nodes.length > 0);
            });
            const rootNodes = availableNodes.filter(isVisible);
            if (rootNodes.length > 0) {
                result = rootNodes;

                this.nodesToGet = result.length;
            }

            const filterStatusNode = statusNode({ label: "", notExported: true, isStatusNode: true });
            const includeGlobs = utils.toGlobArray(this._context.workspaceState.get('includeGlobs'));
            const excludeGlobs = utils.toGlobArray(this._context.workspaceState.get('excludeGlobs'));
            let totalFilters = includeGlobs.length + excludeGlobs.length;
            let tooltip = "";

            if (currentFilter) {
                tooltip += "Tree Filter: \"" + currentFilter + "\"\n";
                totalFilters++;
            }

            if (currentStatusFilter && currentStatusFilter.length > 0) {
                tooltip += "Status Filter: " + currentStatusFilter.join(", ") + "\n";
                totalFilters++;
            }

            if (includeGlobs.length + excludeGlobs.length > 0) {
                includeGlobs.map(function (this: TreeNodeProvider, glob) {
                    tooltip += "Include: " + glob + "\n";
                });
                excludeGlobs.map(function (this: TreeNodeProvider, glob) {
                    tooltip += "Exclude: " + glob + "\n";
                });
            }

            if (totalFilters > 0) {
                filterStatusNode.label = totalFilters + " filter" + (totalFilters === 1 ? '' : 's') + " active";
                filterStatusNode.tooltip = tooltip + "\nRight click for filter options";
                filterStatusNode.icon = "filter";
            }

            if (result.length === 0) {
                if (filterStatusNode.label !== "") {
                    filterStatusNode.label += ", ";
                }
                filterStatusNode.label += "Nothing found";
                filterStatusNode.icon = "issues";

                filterStatusNode.empty = availableNodes.length === 0;
            }

            if (filterStatusNode.label !== "") {
                result.unshift(filterStatusNode);
            }

            const sessionStatusNode = buildSessionStatusNode(this._context);
            if (sessionStatusNode) {
                result.unshift(sessionStatusNode);
            }

            if (config.shouldShowScanModeInTree()) {
                let scanMode = config.scanMode();
                if (scanMode === 'workspace') {
                    scanMode += " and open files";
                }
                const scanModeNode = statusNode({
                    label: "Scan mode: " + scanMode, notExported: true, isStatusNode: true, icon: "search"
                });
                result.unshift(scanModeNode);
            }

            const compacted: TreeNode[] = [];
            result.map(function (this: TreeNodeProvider, child) {
                if (child.isRootTagNode === true && child.nodes?.length === 1) {
                    compacted.push(child.nodes[0]);
                }
                else {
                    compacted.push(child);
                }
            });

            return compacted;
        }
        else if (isPathNode(node)) {
            if (config.shouldCompactFolders() && node.tag === undefined) {
                while (node.nodes && node.nodes.length === 1 && node.nodes[0].nodes && node.nodes[0].nodes.length > 0 && node.nodes[0].isFolder) {
                    node = node.nodes[0];
                }
            }

            if (node.nodes && node.nodes.length > 0) {
                return node.nodes.filter(isVisible);
            }
        }
        else if (isTodoNode(node)) {
            if (node.extraLines && node.extraLines.length > 0) {
                return node.extraLines.filter(isVisible);
            }
            else {
                return node.text || [];
            }
        }
        return [];
    }

    getParent(node: TreeNode) {
        return node.parent;
    }

    getTreeItem(node: TreeNode) {
        let treeItem;
        try {
            treeItem = new TaskTreeItem(isTodoNode(node) ? renderTodoDisplayLabel(node) : node.label + (node.pathLabel ? (" " + node.pathLabel) : ""));
        }
        catch (e) {
            console.log("Failed to create tree item: " + e);
            treeItem = new TaskTreeItem((node && node.label) || "");
        }

        treeItem.id = node.id === undefined ? undefined : String(node.id);
        treeItem.fsPath = node.fsPath;

        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if (node.fsPath) {
            treeItem.node = node;
            if (config.showBadges() && !node.tag && !node.subTag) {
                treeItem.resourceUri = vscode.Uri.file(node.fsPath);
            }

            if (isTodoNode(treeItem.node)) {
                treeItem.tooltip = getAnnotationTooltip(node) || utils.formatLabel(config.tooltipFormat(), node);
            }
            else {
                treeItem.tooltip = treeItem.fsPath;
            }

            if (isPathNode(node)) {
                if (config.shouldCompactFolders() && node.tag === undefined) {
                    let onlyChild = node.nodes.filter(isPathNode).length === 1 ? node.nodes[0] : undefined;
                    let onlyChildParent: TreeNode = node;
                    while (onlyChild && (onlyChild.nodes || []).filter(isPathNode).length > 0 && (onlyChildParent.nodes || []).filter(isPathNode).length === 1) {
                        treeItem.label += "/" + onlyChild.label;
                        onlyChildParent = onlyChild;
                        onlyChild = onlyChild.nodes?.[0];
                    }
                }

                if (expandedNodes[node.fsPath] !== undefined) {
                    treeItem.collapsibleState = (expandedNodes[node.fsPath] === true) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
                }
                else {
                    treeItem.collapsibleState = config.shouldExpand() ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
                }

                if (treeItem.collapsibleState === vscode.TreeItemCollapsibleState.Expanded) {
                    this.nodesToGet += node.nodes.filter(isVisible).length;
                }

                if (node.tag) {
                    treeItem.iconPath = icons.getIcon(this._context, node.tag ? node.tag : node.label, this._debug);
                }
                else if (node.isWorkspaceNode) {
                    treeItem.iconPath = new vscode.ThemeIcon('window');
                }
                else if (node.isFolder) {
                    treeItem.iconPath = vscode.ThemeIcon.Folder;
                }
                else {
                    treeItem.iconPath = vscode.ThemeIcon.File;
                }

                if (node.subTag !== undefined) {
                    let url = config.subTagClickUrl();

                    if (url.trim() !== "") {
                        url = utils.formatLabel(url, node);
                        treeItem.command = {
                            title: node.label,
                            command: "taskvision.openUrl",
                            arguments: [
                                url
                            ]
                        };
                        treeItem.tooltip = "Click to open " + url;
                    }
                }
            }
            else if (isTodoNode(node)) {
                if (node.extraLines && node.extraLines.length > 0) {
                    treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                }

                if (node.isExtraLine !== true) {
                    const annotationIcon = getAnnotationIcon(node);
                    if (annotationIcon) {
                        treeItem.iconPath = annotationIcon;
                    }
                    else if (config.shouldHideIconsWhenGroupedByTag() !== true || (config.shouldGroupByTag() !== true && config.shouldGroupBySubTag() !== true)) {
                        treeItem.iconPath = icons.getIcon(this._context, node.tag ? node.tag : node.label, this._debug);
                    }
                }
                else {
                    treeItem.iconPath = "no-icon";
                }

                const revealBehaviour = vscode.workspace.getConfiguration('taskvision.general').get('revealBehaviour');

                let todoSelection;
                if (revealBehaviour === 'end of todo') {
                    const todoEnd = new vscode.Position(node.line, node.endColumn - 1);
                    todoSelection = new vscode.Selection(todoEnd, todoEnd);
                }
                else if (revealBehaviour === 'start of line') {
                    const lineStart = new vscode.Position(node.line, 0);
                    todoSelection = new vscode.Selection(lineStart, lineStart);
                }
                else if (revealBehaviour === 'start of todo') {
                    const todoStart = new vscode.Position(node.line, node.column - 1);
                    todoSelection = new vscode.Selection(todoStart, todoStart);
                }

                treeItem.command = {
                            title: node.label,
                    command: "taskvision.revealInFile",
                    arguments: [
                        node.uri ? node.uri : vscode.Uri.file(node.fsPath),
                        { selection: todoSelection }
                    ]
                };
                treeItem.description = getAnnotationDescription(node);
            }
        }
        else {
            treeItem.description = node.label;
            treeItem.label = "";
            treeItem.tooltip = node.tooltip;
            treeItem.iconPath = new vscode.ThemeIcon(node.icon || 'info');
        }

        if (config.shouldShowCounts() && isPathNode(node)) {
            const tagCounts: Record<string, number> = {};
            countTags(node, tagCounts, false);
            const total = Object.values(tagCounts).reduce(function (this: TreeNodeProvider, a, b) { return a + b; }, 0);
            treeItem.description = total.toString();
        }

        if (node.isFolder === true) {
            treeItem.contextValue = "folder";
        }
        else if (node.isRootTagNode === true) {
            treeItem.contextValue = "tag";
        }
        else if (isTaskAnnotationNode(node)) {
            treeItem.contextValue = "task";
        }
        else if (isContextAnnotationNode(node)) {
            treeItem.contextValue = "context";
        }
        else if (isReviewAnnotationNode(node)) {
            treeItem.contextValue = "review";
        }
        else if (!node.isWorkspaceNode && !node.isStatusNode && node.subTag === undefined) {
            treeItem.contextValue = "file";
        }

        if (node.subTag !== undefined) {
            treeHasSubTags = true;
        }

        if (!node.isStatusNode) {
            this.nodesToGet--;
        }

        if (this.nodesToGet === 0 && this.onTreeRefreshed) {
            this.onTreeRefreshed();
        }

        return treeItem;
    }

    clear(folders?: readonly vscode.WorkspaceFolder[]) {
        nodes = [];

        workspaceFolders = folders;

        addWorkspaceFolders();
    }

    rebuild() {
        buildCounter = (buildCounter + 1) % 100;
    }

    refresh() {
        treeHasSubTags = false;

        this.sort();

        this._onDidChangeTreeData.fire();
    }

    applyFilters(children: TreeNode[]) {
        const matcher = currentFilter ? new RegExp(currentFilter, config.showFilterCaseSensitive() ? "" : "i") : undefined;

        if (children === undefined) {
            children = nodes;
        }

        children.forEach(child => {
            if (child.type === TODO) {
                const textMatch = !matcher || matcher.test(child.label);
                const statusMatch = !currentStatusFilter || currentStatusFilter.indexOf(taskState.normaliseStatus(child.status) || '') !== -1;
                child.visible = textMatch && statusMatch;
            }

            if (child.nodes !== undefined) {
                this.applyFilters(child.nodes);
            }
            if (child.extraLines !== undefined) {
                this.applyFilters(child.extraLines);
            }
            if ((child.nodes && child.nodes.length > 0) || (child.extraLines && child.extraLines.length > 0)) {
                const visibleNodes = child.nodes ? child.nodes.filter(isVisible).length : 0;
                const visibleExtraLines = child.extraLines ? child.extraLines.filter(isVisible).length : 0;
                child.visible = visibleNodes + visibleExtraLines > 0;
            }
        });
    }

    filter(text?: string, children?: TreeNode[]) {
        if (children === undefined) {
            currentFilter = text;
            children = nodes;
        }

        this.applyFilters(children);
    }

    clearTreeFilter(children?: TreeNode[]) {
        if (children === undefined) {
            currentFilter = undefined;
            children = nodes;
        }

        this.applyFilters(children);
    }

    filterByStatus(statuses?: string[], children?: TreeNode[]) {
        if (children === undefined) {
            currentStatusFilter = normaliseStatusFilter(statuses);
            children = nodes;
        }

        this.applyFilters(children);
    }

    clearStatusFilter(children?: TreeNode[]) {
        if (children === undefined) {
            currentStatusFilter = undefined;
            children = nodes;
        }

        this.applyFilters(children);
    }

    add(result: SearchResult) {
        if (nodes.length === 0) {
            addWorkspaceFolders();
        }

        const fullPath = result.uri.scheme === 'file' ? result.uri.fsPath : path.join(result.uri.authority, result.uri.fsPath);

        const rootNode = locateWorkspaceNode(fullPath);
        const todoNode = createTodoNode(result, rootNode);

        if (config.shouldHideFromTree(todoNode.tag ? todoNode.tag : todoNode.label)) {
            todoNode.hidden = true;
        }
        let childNode: TreeNode | undefined;

        const tagPath = todoNode.subTag ? todoNode.tag + " (" + todoNode.subTag + ")" : todoNode.tag;

        if (config.shouldShowTagsOnly()) {
            if (config.shouldGroupByTag()) {
                if (todoNode.tag) {
                    childNode = nodes.find(findTagNode, tagPath);
                    if (childNode === undefined) {
                        childNode = createTagNode(todoNode.fsPath, tagPath);
                        nodes.push(childNode);
                    }
                }
                else if (nodes.find(findTodoNode, todoNode) === undefined) {
                    nodes.push(todoNode);
                }
            }
            else if (config.shouldGroupBySubTag()) {
                if (todoNode.subTag) {
                    childNode = nodes.find(findSubTagNode, todoNode.subTag);
                    if (childNode === undefined) {
                        childNode = createSubTagNode(todoNode.subTag);
                        nodes.unshift(childNode);
                    }
                }
                else if (nodes.find(findTodoNode, todoNode) === undefined) {
                    nodes.push(todoNode);
                }
            }
            else {
                if (nodes.find(findTodoNode, todoNode) === undefined) {
                    nodes.push(todoNode);
                }
            }
        }
        else if (config.shouldFlatten() || rootNode === undefined) {
            childNode = locateFlatChildNode(rootNode, result, todoNode.tag, todoNode.subTag);
        }
        else if (rootNode) {
            const relativePath = path.relative(rootNode.fsPath, fullPath);
            let pathElements: string[] = [];
            if (relativePath !== "") {
                pathElements = relativePath.split(path.sep);
            }
            if (todoNode.subTag) {
                if (config.shouldGroupBySubTag() !== true) {
                    pathElements.push(todoNode.subTag);
                }
            }
            childNode = locateTreeChildNode(rootNode, pathElements, todoNode.tag, todoNode.subTag);
        }

        if (childNode) {
            // needed?
            if (childNode.nodes === undefined) {
                childNode.nodes = [];
            }

            childNode.expanded = result.expanded;

            if (childNode.nodes.find(findTodoNode, todoNode) === undefined) {
                todoNode.parent = childNode;
                childNode.nodes.push(todoNode);
                childNode.showCount = true;
            }
        }
    }

    reset(uri: vscode.Uri, children?: TreeNode[]) {
        const fullPath = uri.scheme === 'file' ? uri.fsPath : path.join(uri.authority, uri.fsPath);

        const root = children === undefined;
        if (children === undefined) {
            children = nodes;
        }
        children = children.filter(function (this: TreeNodeProvider, child) {
            let keep = true;
            if (child.nodes !== undefined) {
                this.reset(uri, child.nodes);
            }
            if (child.type === TODO && !child.tag && child.fsPath == fullPath) // no tag (e.g. markdown)
            {
                keep = false;
            }
            else if (child.type === TODO && child.parent === undefined && child.fsPath == fullPath) // top level todo node
            {
                keep = false;
            }
            else if (child.fsPath === fullPath || child.isRootTagNode) {
                if (config.shouldShowTagsOnly()) {
                    if (child.nodes) {
                        child.nodes = child.nodes.filter(function (this: TreeNodeProvider, node) {
                            return isTodoNode(node) && node.fsPath !== fullPath;
                        });
                    }
                }
                else {
                    child.nodes = [];
                }
            }
            return keep;
        }, this);

        if (root) {
            nodes = children;
        }
    }

    remove(callback: ((path: string) => void) | undefined, uri: vscode.Uri, children?: TreeNode[]): TreeNode[] {
        const fullPath = uri.scheme === 'file' ? uri.fsPath : path.join(uri.authority, uri.fsPath);

        function removeNodesByFilename(children: TreeNode[], me: TreeNodeProvider) {
            return children.filter(function (this: TreeNodeProvider, child) {
                if (child.nodes !== undefined) {
                    child.nodes = me.remove(callback, uri, child.nodes);
                }
                const shouldRemove = (child.fsPath === fullPath);
                if (shouldRemove) {
                    delete expandedNodes[child.fsPath];
                    me._context.workspaceState.update('expandedNodes', expandedNodes);
                    if (callback) {
                        callback(child.fsPath);
                    }
                }
                return shouldRemove === false;
            }, me);
        }

        function removeEmptyNodes(children: TreeNode[], me: TreeNodeProvider): TreeNode[] {
            return children.filter(function (this: TreeNodeProvider, child) {
                if (child.nodes !== undefined) {
                    child.nodes = me.remove(callback, uri, child.nodes);
                }
                const shouldRemove = (child.nodes && child.nodes.length === 0 && child.isWorkspaceNode !== true);
                if (shouldRemove) {
                    delete expandedNodes[child.fsPath];
                    me._context.workspaceState.update('expandedNodes', expandedNodes);
                    if (callback) {
                        callback(child.fsPath);
                    }
                }
                return shouldRemove !== true;
            }, me);
        }

        const root = children === undefined;
        if (children === undefined) {
            children = nodes;
        }

        children = removeNodesByFilename(children, this);
        children = removeEmptyNodes(children, this);

        if (root) {
            nodes = children;
        }

        return children;
    }

    getElement(filename: string, found: (node: TreeNode) => void, children?: TreeNode[]) {
        if (children === undefined) {
            children = nodes;
        }
        children.forEach(function (this: TreeNodeProvider, child) {
            if (child.fsPath === filename) {
                found(child);
            }
            else if (child.nodes !== undefined) {
                return this.getElement(filename, found, child.nodes);
            }
        }, this);
    }

    setExpanded(path: string, expanded: boolean) {
        expandedNodes[path] = expanded;
        this._context.workspaceState.update('expandedNodes', expandedNodes);
    }

    clearExpansionState() {
        expandedNodes = {};
        this._context.workspaceState.update('expandedNodes', expandedNodes);
    }

    getTagCountsForStatusBar(fileFilter?: string) {
        const tagCounts: Record<string, number> = {};
        return countChildTags(nodes, tagCounts, true, fileFilter);
    }

    getTagCountsForActivityBar() {
        const tagCounts: Record<string, number> = {};
        return countChildTags(nodes, tagCounts, false);
    }

    exportChildren(parent: ExportTree, children: TreeNode[]) {
        children.forEach(function (this: TreeNodeProvider, child) {
            if (child.type === PATH) {
                const branch: ExportTree = {};
                parent[child.label] = branch;
                this.exportChildren(branch, this.getChildren(child));
            }
            else if (!child.notExported) {
                let itemLabel = "line " + ((child.line ?? 0) + 1);
                if (config.shouldShowTagsOnly() === true) {
                    itemLabel = child.fsPath + " " + itemLabel;
                }
                parent[itemLabel] = renderTodoDisplayLabel(child);
            }
        }, this);
        return parent;
    }

    exportTree() {
        let exported: ExportTree = {};
        const children = this.getChildren();
        exported = this.exportChildren(exported, children);
        return exported;
    }

    getFirstNode() {
        const availableNodes = nodes.filter(function (this: TreeNodeProvider, node) {
            return node.nodes === undefined || (node.nodes.length > 0);
        });
        const rootNodes = availableNodes.filter(isVisible);
        if (rootNodes.length > 0) {
            return rootNodes[0];
        }
        return undefined;
    }

    hasSubTags() {
        return treeHasSubTags;
    }

    getStatusFilter() {
        return currentStatusFilter ? currentStatusFilter.slice() : [];
    }

    collectTodoNodes(children: TreeNode[] | undefined, visibleOnly: boolean, collected?: TodoNode[]): TodoNode[] {
        if (children === undefined) {
            children = nodes;
        }
        if (collected === undefined) {
            collected = [];
        }

        children.forEach(function (this: TreeNodeProvider, child) {
            if (child.isStatusNode) {
                return;
            }

            if (isTodoNode(child) && (!visibleOnly || isVisible(child))) {
                collected.push(child);
            }

            if (child.nodes !== undefined) {
                this.collectTodoNodes(child.nodes, visibleOnly, collected);
            }
            if (child.extraLines !== undefined) {
                this.collectTodoNodes(child.extraLines, visibleOnly, collected);
            }
        }, this);

        return collected;
    }

    getVisibleTodoNodes(node?: TreeNode): TodoNode[] {
        if (node && isTodoNode(node)) {
            return [node].concat(node.extraLines ? this.collectTodoNodes(node.extraLines, true, []) : []);
        }

        if (node) {
            return this.collectTodoNodes(this.getChildren(node) || [], true, []);
        }

        return this.collectTodoNodes(nodes, true, []);
    }

    getAllTodoNodes() {
        return this.collectTodoNodes(nodes, false, []);
    }

    sort(children?: TreeNode[]) {
        if (config.shouldSortTree()) {
            if (children === undefined) {
                children = nodes;
            }
            children.forEach(function (this: TreeNodeProvider, child) {
                if (child.nodes !== undefined) {
                    this.sort(child.nodes);
                }
            }, this);

            if (config.shouldShowTagsOnly()) {
                if (config.shouldSortTagsOnlyViewAlphabetically()) {
                    children.sort(sortTagsOnlyViewByLabel);
                }
                else {
                    children.sort(sortTagsOnlyViewByTagOrder);
                }
            }
            else {
                children.sort(sortByFilenameAndLine);
            }
        }
    }
}

export { TreeNodeProvider, locateWorkspaceNode };
