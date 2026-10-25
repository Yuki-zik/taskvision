import { errorMessage } from './validation';
const LEGACY_NAMESPACE = ['todo', 'tree'].join('-');
const CURRENT_NAMESPACE = 'taskvision';
const MIGRATION_VERSION = 2000;

const SETTING_PATHS = [
  'general.debug',
  'general.automaticGitRefreshInterval',
  'general.periodicRefreshInterval',
  'general.revealBehaviour',
  'general.exportPath',
  'general.rootFolder',
  'general.schemes',
  'general.statusBar',
  'general.showIconsInsteadOfTagsInStatusBar',
  'general.statusBarClickBehaviour',
  'general.tagGroups',
  'general.tags',
  'general.showActivityBarBadge',
  'highlights.customHighlight',
  'highlights.defaultHighlight',
  'highlights.enabled',
  'highlights.highlightDelay',
  'highlights.useColourScheme',
  'highlights.foregroundColourScheme',
  'highlights.backgroundColourScheme',
  'filtering.excludedWorkspaces',
  'filtering.excludeGlobs',
  'filtering.ignoreGitSubmodules',
  'filtering.includedWorkspaces',
  'filtering.includeGlobs',
  'filtering.includeHiddenFiles',
  'filtering.passGlobsToRipgrep',
  'filtering.scopes',
  'filtering.useBuiltInExcludes',
  'tree.autoRefresh',
  'tree.disableCompactFolders',
  'tree.expanded',
  'tree.filterCaseSensitive',
  'tree.flat',
  'tree.groupedByTag',
  'tree.groupedBySubTag',
  'tree.hideIconsWhenGroupedByTag',
  'tree.hideTreeWhenEmpty',
  'tree.labelFormat',
  'tree.scanAtStartup',
  'tree.scanMode',
  'tree.showBadges',
  'tree.showCountsInTree',
  'tree.showInExplorer',
  'tree.showCurrentScanMode',
  'tree.showScanOpenFilesOrWorkspaceButton',
  'tree.subTagClickUrl',
  'tree.showTagsFromOpenFilesOnly',
  'tree.sortTagsOnlyViewAlphabetically',
  'tree.sort',
  'tree.tagsOnly',
  'tree.tooltipFormat',
  'tree.trackFile',
  'tree.buttons.reveal',
  'tree.buttons.scanMode',
  'tree.buttons.viewStyle',
  'tree.buttons.groupByTag',
  'tree.buttons.groupBySubTag',
  'tree.buttons.filter',
  'tree.buttons.refresh',
  'tree.buttons.expand',
  'tree.buttons.export',
  'regex.regex',
  'regex.regexCaseSensitive',
  'regex.subTagRegex',
  'regex.enableMultiLine',
  'ripgrep.ripgrep',
  'ripgrep.ripgrepArgs',
  'ripgrep.ripgrepMaxBuffer',
  'ripgrep.usePatternFile',
];

async function migrateLegacySettings(
  vscode: typeof import('vscode'),
  context: Pick<import('vscode').ExtensionContext, 'globalState'>,
  log?: (message: string) => void,
) {
  function trace(text: string) {
    if (typeof log === 'function') {
      log(text);
    }
  }

  if (context.globalState.get('migratedVersion', 0) >= MIGRATION_VERSION) {
    return { migrated: false, updates: 0 };
  }

  let updates = 0;

  async function copySettingForScope(
    settingPath: string,
    inspectKey: 'globalValue' | 'workspaceValue' | 'workspaceFolderValue',
    target: import('vscode').ConfigurationTarget,
    scope?: import('vscode').Uri,
  ) {
    const legacyConfig = scope
      ? vscode.workspace.getConfiguration(LEGACY_NAMESPACE, scope)
      : vscode.workspace.getConfiguration(LEGACY_NAMESPACE);
    const currentConfig = scope
      ? vscode.workspace.getConfiguration(CURRENT_NAMESPACE, scope)
      : vscode.workspace.getConfiguration(CURRENT_NAMESPACE);
    const legacySetting = legacyConfig.inspect(settingPath);
    const currentSetting = currentConfig.inspect(settingPath);

    if (!legacySetting) {
      return;
    }

    const legacyValue = legacySetting[inspectKey];
    const currentValue = currentSetting ? currentSetting[inspectKey] : undefined;

    if (legacyValue !== undefined && currentValue === undefined) {
      await currentConfig.update(settingPath, legacyValue, target);
      updates++;
      trace("Migrated '" + settingPath + "' to " + target);
    }
  }

  let hadFailure = false;

  for (let i = 0; i < SETTING_PATHS.length; i++) {
    const settingPath = SETTING_PATHS[i];

    try {
      await copySettingForScope(settingPath, 'globalValue', vscode.ConfigurationTarget.Global);
      await copySettingForScope(
        settingPath,
        'workspaceValue',
        vscode.ConfigurationTarget.Workspace,
      );

      if (vscode.workspace.workspaceFolders) {
        for (
          let folderIndex = 0;
          folderIndex < vscode.workspace.workspaceFolders.length;
          folderIndex++
        ) {
          const folder = vscode.workspace.workspaceFolders[folderIndex];
          await copySettingForScope(
            settingPath,
            'workspaceFolderValue',
            vscode.ConfigurationTarget.WorkspaceFolder,
            folder.uri,
          );
        }
      }
    } catch (error) {
      hadFailure = true;
      trace("Failed to migrate setting '" + settingPath + "': " + errorMessage(error));
    }
  }

  if (hadFailure) {
    // Leave migratedVersion unchanged so migration is retried next startup
    // instead of permanently marking a partially-failed migration as done.
    trace(
      'Legacy settings migration completed with errors (' +
        updates +
        ' updates); will retry next startup.',
    );
    return { migrated: updates > 0, updates: updates, hadFailure: true };
  }

  await context.globalState.update('migratedVersion', MIGRATION_VERSION);
  trace('Legacy settings migration completed with ' + updates + ' updates.');

  return { migrated: updates > 0, updates: updates };
}

export {
  LEGACY_NAMESPACE,
  CURRENT_NAMESPACE,
  MIGRATION_VERSION,
  SETTING_PATHS,
  migrateLegacySettings,
};
