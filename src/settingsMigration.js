var LEGACY_NAMESPACE = [ 'todo', 'tree' ].join( '-' );
var CURRENT_NAMESPACE = 'taskvision';
var MIGRATION_VERSION = 2000;

var SETTING_PATHS = [
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
    'ripgrep.usePatternFile'
];

async function migrateLegacySettings( vscode, context, log )
{
    function trace( text )
    {
        if( typeof log === 'function' )
        {
            log( text );
        }
    }

    if( context.globalState.get( 'migratedVersion', 0 ) >= MIGRATION_VERSION )
    {
        return { migrated: false, updates: 0 };
    }

    var updates = 0;

    async function copySettingForScope( settingPath, inspectKey, target, scope )
    {
        var legacyConfig = scope ? vscode.workspace.getConfiguration( LEGACY_NAMESPACE, scope ) : vscode.workspace.getConfiguration( LEGACY_NAMESPACE );
        var currentConfig = scope ? vscode.workspace.getConfiguration( CURRENT_NAMESPACE, scope ) : vscode.workspace.getConfiguration( CURRENT_NAMESPACE );
        var legacySetting = legacyConfig.inspect( settingPath );
        var currentSetting = currentConfig.inspect( settingPath );

        if( !legacySetting )
        {
            return;
        }

        var legacyValue = legacySetting[ inspectKey ];
        var currentValue = currentSetting ? currentSetting[ inspectKey ] : undefined;

        if( legacyValue !== undefined && currentValue === undefined )
        {
            await currentConfig.update( settingPath, legacyValue, target );
            updates++;
            trace( "Migrated '" + settingPath + "' to " + target );
        }
    }

    for( var i = 0; i < SETTING_PATHS.length; i++ )
    {
        var settingPath = SETTING_PATHS[ i ];

        try
        {
            await copySettingForScope( settingPath, 'globalValue', vscode.ConfigurationTarget.Global );
            await copySettingForScope( settingPath, 'workspaceValue', vscode.ConfigurationTarget.Workspace );

            if( vscode.workspace.workspaceFolders )
            {
                for( var folderIndex = 0; folderIndex < vscode.workspace.workspaceFolders.length; folderIndex++ )
                {
                    var folder = vscode.workspace.workspaceFolders[ folderIndex ];
                    await copySettingForScope( settingPath, 'workspaceFolderValue', vscode.ConfigurationTarget.WorkspaceFolder, folder.uri );
                }
            }
        }
        catch( error )
        {
            trace( "Failed to migrate setting '" + settingPath + "': " + error.message );
        }
    }

    await context.globalState.update( 'migratedVersion', MIGRATION_VERSION );
    trace( "Legacy settings migration completed with " + updates + " updates." );

    return { migrated: updates > 0, updates: updates };
}

module.exports.LEGACY_NAMESPACE = LEGACY_NAMESPACE;
module.exports.CURRENT_NAMESPACE = CURRENT_NAMESPACE;
module.exports.MIGRATION_VERSION = MIGRATION_VERSION;
module.exports.SETTING_PATHS = SETTING_PATHS;
module.exports.migrateLegacySettings = migrateLegacySettings;
