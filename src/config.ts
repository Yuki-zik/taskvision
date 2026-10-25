import type {ExtensionState, HighlightSettings, RegexConfiguration} from './model';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as attributes from './attributes.js';

let context: ExtensionState;

let tagGroupLookup: Record<string,string> = {};

function init(c: ExtensionState) {
    context = c;

    refreshTagGroupLookup();
}

function shouldGroupByTag() {
    return context.workspaceState.get('groupedByTag', vscode.workspace.getConfiguration('taskvision.tree').get('groupedByTag', false));
}

function shouldGroupBySubTag() {
    return context.workspaceState.get('groupedBySubTag', vscode.workspace.getConfiguration('taskvision.tree').get('groupedBySubTag', false));
}

function shouldExpand() {
    return context.workspaceState.get('expanded', vscode.workspace.getConfiguration('taskvision.tree').get('expanded', false));
}

function shouldFlatten() {
    return context.workspaceState.get('flat', vscode.workspace.getConfiguration('taskvision.tree').get('flat', false));
}

function shouldShowTagsOnly() {
    return context.workspaceState.get('tagsOnly', vscode.workspace.getConfiguration('taskvision.tree').get('tagsOnly', false));
}

function shouldShowCounts() {
    return vscode.workspace.getConfiguration('taskvision.tree').get('showCountsInTree', false);
}

function shouldHideIconsWhenGroupedByTag() {
    return vscode.workspace.getConfiguration('taskvision.tree').get('hideIconsWhenGroupedByTag', false);
}

function showFilterCaseSensitive() {
    return vscode.workspace.getConfiguration('taskvision.tree').get('filterCaseSensitive', false);
}

function isRegexCaseSensitive() {
    return vscode.workspace.getConfiguration('taskvision.regex').get('regexCaseSensitive', true);
}

function showBadges() {
    return vscode.workspace.getConfiguration('taskvision.tree').get('showBadges', false);
}

function regex(): RegexConfiguration {
    return {
        tags: tags(),
        regex: vscode.workspace.getConfiguration('taskvision.regex').get<string>('regex', '($TAGS)'),
        caseSensitive: vscode.workspace.getConfiguration('taskvision.regex').get<boolean>('regexCaseSensitive', true),
        multiLine: vscode.workspace.getConfiguration('taskvision.regex').get<boolean>('enableMultiLine', false)
    };
}

function subTagRegex() {
    return vscode.workspace.getConfiguration('taskvision.regex').get<string>('subTagRegex', '(^:\\s*)');
}

function ripgrepPath() {
    function exeName() {
        const isWin = /^win/.test(process.platform);
        return isWin ? "rg.exe" : "rg";
    }

    function platformFolderName() {
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
        if (process.platform === 'win32') {
            return 'win32-' + arch;
        }
        if (process.platform === 'darwin') {
            return 'darwin-' + arch;
        }
        return 'linux-' + arch;
    }

    function exePathIsDefined(rgExePath?: string) {
        return rgExePath && fs.existsSync(rgExePath) ? rgExePath : undefined;
    }

    function findOnPath() {
        const pathValue = process.env.PATH || '';
        const parts = pathValue.split(path.delimiter).filter(Boolean);
        const exe = exeName();
        let result;

        parts.some(function (part) {
            result = exePathIsDefined(path.join(part, exe));
            return result !== undefined;
        });

        return result;
    }

    let rgPath: string | undefined;

    rgPath = exePathIsDefined(vscode.workspace.getConfiguration('taskvision.ripgrep').get<string>('ripgrep')!);
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, "node_modules/vscode-ripgrep/bin/", exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, "node_modules.asar.unpacked/vscode-ripgrep/bin/", exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, "node_modules/@vscode/ripgrep/bin/", exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, "node_modules.asar.unpacked/@vscode/ripgrep/bin/", exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, "node_modules/@vscode/ripgrep-universal/bin/", platformFolderName(), exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, "node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/", platformFolderName(), exeName()));
    if (rgPath) return rgPath;

    rgPath = findOnPath();
    if (rgPath) return rgPath;

    return rgPath;
}

function tags() {
    const tags = vscode.workspace.getConfiguration('taskvision.general').get<string[]>('tags')!;
    return tags.length > 0 ? tags : ["TODO"];
}

function shouldSortTagsOnlyViewAlphabetically() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('sortTagsOnlyViewAlphabetically')!;
}

function labelFormat() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<string>('labelFormat')!;
}

function tooltipFormat() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<string>('tooltipFormat')!;
}

function clickingStatusBarShouldRevealTree() {
    return vscode.workspace.getConfiguration('taskvision.general').get<string>('statusBarClickBehaviour')! === "reveal";
}

function clickingStatusBarShouldToggleHighlights() {
    return vscode.workspace.getConfiguration('taskvision.general').get<string>('statusBarClickBehaviour')! === "toggle highlights";
}

function isValidScheme(uri: import("vscode").Uri | undefined) {
    const schemes = vscode.workspace.getConfiguration('taskvision.general').get<string[]>('schemes')!;
    return uri && uri.scheme && schemes && schemes.length && schemes.indexOf(uri.scheme) !== -1;
}

function shouldUseBuiltInFileExcludes() {
    const useBuiltInExcludes = vscode.workspace.getConfiguration('taskvision.filtering').get<string>('useBuiltInExcludes')!;
    return useBuiltInExcludes === "file excludes" || useBuiltInExcludes === "file and search excludes";
}

function shouldUseBuiltInSearchExcludes() {
    const useBuiltInExcludes = vscode.workspace.getConfiguration('taskvision.filtering').get<string>('useBuiltInExcludes')!;
    return useBuiltInExcludes === "search excludes" || useBuiltInExcludes === "file and search excludes";
}

function shouldIgnoreGitSubmodules() {
    return vscode.workspace.getConfiguration('taskvision.filtering').get<boolean>('ignoreGitSubmodules')!;
}

function refreshTagGroupLookup() {
    const tagGroups = vscode.workspace.getConfiguration('taskvision.general').get<Record<string, string[]>>('tagGroups')!;
    tagGroupLookup = Object.keys(tagGroups).reduce((acc, propName) =>
        tagGroups[propName].reduce((a: Record<string, string>, num: string) => {
            a[num] = propName;
            return a;
        }, acc), {});
}

function tagGroup(tag: string) {
    return tagGroupLookup[tag];
}

function shouldCompactFolders() {
    return vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders')! &&
        vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('disableCompactFolders')! !== true;
}

function shouldHideFromTree(tag: string) {
    return attributes.getAttribute(tag, 'hideFromTree', false);
}

function shouldHideFromStatusBar(tag: string) {
    return attributes.getAttribute(tag, 'hideFromStatusBar', false);
}

function shouldHideFromActivityBar(tag: string) {
    return attributes.getAttribute(tag, 'hideFromActivityBar', false);
}

function shouldSortTree() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('sort')!;
}

function scanMode() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<string>('scanMode')!;
}

function shouldShowScanModeInTree() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<boolean>('showCurrentScanMode')!;
}

function shouldUseColourScheme() {
    return vscode.workspace.getConfiguration('taskvision.highlights').get<boolean>('useColourScheme')!;
}

function foregroundColourScheme() {
    return vscode.workspace.getConfiguration('taskvision.highlights').get<string[]>('foregroundColourScheme')!;
}

function backgroundColourScheme() {
    return vscode.workspace.getConfiguration('taskvision.highlights').get<string[]>('backgroundColourScheme')!;
}

function defaultHighlight() {
    return vscode.workspace.getConfiguration('taskvision.highlights').get<HighlightSettings>('defaultHighlight')!;
}

function customHighlight() {
    return vscode.workspace.getConfiguration('taskvision.highlights').get<Record<string, HighlightSettings>>('customHighlight')!;
}

function subTagClickUrl() {
    return vscode.workspace.getConfiguration('taskvision.tree').get<string>('subTagClickUrl')!;
}

function shouldShowIconsInsteadOfTagsInStatusBar() {
    return vscode.workspace.getConfiguration('taskvision.general').get<boolean>('showIconsInsteadOfTagsInStatusBar')!;
}

function shouldShowActivityBarBadge() {
    return vscode.workspace.getConfiguration('taskvision.general').get<boolean>('showActivityBarBadge')!;
}

function shouldShowStatusPrefix() {
    return vscode.workspace.getConfiguration('taskvision.tree').get('showStatusPrefix', true);
}

function defaultTaskPriority() {
    return vscode.workspace.getConfiguration('taskvision.tasks').get('defaultPriority', 'normal');
}

function aiContextOutputDir() {
    return vscode.workspace.getConfiguration('taskvision.aiContext').get('outputDir', '.taskvision');
}

function shouldRespectCurrentFiltersForAiContext() {
    return vscode.workspace.getConfiguration('taskvision.aiContext').get('respectCurrentFilters', true);
}

export { init, shouldGroupByTag, shouldGroupBySubTag, shouldExpand, shouldFlatten, shouldShowTagsOnly, shouldShowCounts, shouldHideIconsWhenGroupedByTag, showFilterCaseSensitive, isRegexCaseSensitive, showBadges, regex, subTagRegex, ripgrepPath, tags, shouldSortTagsOnlyViewAlphabetically, labelFormat, tooltipFormat, clickingStatusBarShouldRevealTree, clickingStatusBarShouldToggleHighlights, isValidScheme, shouldIgnoreGitSubmodules, refreshTagGroupLookup, tagGroup, shouldCompactFolders, shouldUseBuiltInFileExcludes, shouldUseBuiltInSearchExcludes, shouldHideFromTree, shouldHideFromStatusBar, shouldHideFromActivityBar, shouldSortTree, scanMode, shouldShowScanModeInTree, shouldUseColourScheme, foregroundColourScheme, backgroundColourScheme, defaultHighlight, customHighlight, subTagClickUrl, shouldShowIconsInsteadOfTagsInStatusBar, shouldShowActivityBarBadge, shouldShowStatusPrefix, defaultTaskPriority, aiContextOutputDir, shouldRespectCurrentFiltersForAiContext };
