var vscode = require( 'vscode' );
var fs = require( 'fs' );
var path = require( 'path' );
var attributes = require( './attributes.js' );

var context;

var tagGroupLookup = {};

function init( c )
{
    context = c;

    refreshTagGroupLookup();
}

function shouldGroupByTag()
{
    return context.workspaceState.get( 'groupedByTag', vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'groupedByTag', false ) );
}

function shouldGroupBySubTag()
{
    return context.workspaceState.get( 'groupedBySubTag', vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'groupedBySubTag', false ) );
}

function shouldExpand()
{
    return context.workspaceState.get( 'expanded', vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'expanded', false ) );
}

function shouldFlatten()
{
    return context.workspaceState.get( 'flat', vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'flat', false ) );
}

function shouldShowTagsOnly()
{
    return context.workspaceState.get( 'tagsOnly', vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'tagsOnly', false ) );
}

function shouldShowCounts()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'showCountsInTree', false );
}

function shouldHideIconsWhenGroupedByTag()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'hideIconsWhenGroupedByTag', false );
}

function showFilterCaseSensitive()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'filterCaseSensitive', false );
}

function isRegexCaseSensitive()
{
    return vscode.workspace.getConfiguration( 'taskvision.regex' ).get( 'regexCaseSensitive', true );
}

function showBadges()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).get( 'showBadges', false );
}

function regex()
{
    return {
        tags: tags(),
        regex: vscode.workspace.getConfiguration( 'taskvision.regex' ).get( 'regex' ),
        caseSensitive: vscode.workspace.getConfiguration( 'taskvision.regex' ).get( 'regexCaseSensitive' ),
        multiLine: vscode.workspace.getConfiguration( 'taskvision.regex' ).get( 'enableMultiLine' )
    };
}

function subTagRegex()
{
    return vscode.workspace.getConfiguration( 'taskvision.regex' ).get( 'subTagRegex' );
}

function ripgrepPath()
{
    function exeName()
    {
        var isWin = /^win/.test( process.platform );
        return isWin ? "rg.exe" : "rg";
    }

    function exePathIsDefined( rgExePath )
    {
        return fs.existsSync( rgExePath ) ? rgExePath : undefined;
    }

    var rgPath = "";

    rgPath = exePathIsDefined( vscode.workspace.getConfiguration( 'taskvision.ripgrep' ).ripgrep );
    if( rgPath ) return rgPath;

    rgPath = exePathIsDefined( path.join( vscode.env.appRoot, "node_modules/vscode-ripgrep/bin/", exeName() ) );
    if( rgPath ) return rgPath;

    rgPath = exePathIsDefined( path.join( vscode.env.appRoot, "node_modules.asar.unpacked/vscode-ripgrep/bin/", exeName() ) );
    if( rgPath ) return rgPath;

    rgPath = exePathIsDefined( path.join( vscode.env.appRoot, "node_modules/@vscode/ripgrep/bin/", exeName() ) );
    if( rgPath ) return rgPath;

    rgPath = exePathIsDefined( path.join( vscode.env.appRoot, "node_modules.asar.unpacked/@vscode/ripgrep/bin/", exeName() ) );
    if( rgPath ) return rgPath;

    return rgPath;
}

function tags()
{
    var tags = vscode.workspace.getConfiguration( 'taskvision.general' ).tags;
    return tags.length > 0 ? tags : [ "TODO" ];
}

function shouldSortTagsOnlyViewAlphabetically()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).sortTagsOnlyViewAlphabetically;
}

function labelFormat()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).labelFormat;
}

function tooltipFormat()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).tooltipFormat;
}

function clickingStatusBarShouldRevealTree()
{
    return vscode.workspace.getConfiguration( 'taskvision.general' ).statusBarClickBehaviour === "reveal";
}

function clickingStatusBarShouldToggleHighlights()
{
    return vscode.workspace.getConfiguration( 'taskvision.general' ).statusBarClickBehaviour === "toggle highlights";
}

function isValidScheme( uri )
{
    var schemes = vscode.workspace.getConfiguration( 'taskvision.general' ).schemes;
    return uri && uri.scheme && schemes && schemes.length && schemes.indexOf( uri.scheme ) !== -1;
}

function shouldUseBuiltInFileExcludes()
{
    var useBuiltInExcludes = vscode.workspace.getConfiguration( 'taskvision.filtering' ).useBuiltInExcludes;
    return useBuiltInExcludes === "file exclude" || useBuiltInExcludes === "file and search excludes";
}

function shouldUseBuiltInSearchExcludes()
{
    var useBuiltInExcludes = vscode.workspace.getConfiguration( 'taskvision.filtering' ).useBuiltInExcludes;
    return useBuiltInExcludes === "search excludes" || useBuiltInExcludes === "file and search excludes";
}

function shouldIgnoreGitSubmodules()
{
    return vscode.workspace.getConfiguration( 'taskvision.filtering' ).ignoreGitSubmodules;
}

function refreshTagGroupLookup()
{
    var tagGroups = vscode.workspace.getConfiguration( 'taskvision.general' ).tagGroups;
    tagGroupLookup = Object.keys( tagGroups ).reduce( ( acc, propName ) =>
        tagGroups[ propName ].reduce( ( a, num ) =>
        {
            a[ num ] = propName;
            return a;
        }, acc ), {} );
}

function tagGroup( tag )
{
    return tagGroupLookup[ tag ];
}

function shouldCompactFolders()
{
    return vscode.workspace.getConfiguration( 'explorer' ).compactFolders &&
        vscode.workspace.getConfiguration( 'taskvision.tree' ).disableCompactFolders !== true;
}

function shouldHideFromTree( tag )
{
    return attributes.getAttribute( tag, 'hideFromTree', false );
}

function shouldHideFromStatusBar( tag )
{
    return attributes.getAttribute( tag, 'hideFromStatusBar', false );
}

function shouldHideFromActivityBar( tag )
{
    return attributes.getAttribute( tag, 'hideFromActivityBar', false );
}

function shouldSortTree()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).sort;
}

function scanMode()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).scanMode;
}

function shouldShowScanModeInTree()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).showCurrentScanMode;
}

function shouldUseColourScheme()
{
    return vscode.workspace.getConfiguration( 'taskvision.highlights' ).useColourScheme;
}

function foregroundColourScheme()
{
    return vscode.workspace.getConfiguration( 'taskvision.highlights' ).foregroundColourScheme;
}

function backgroundColourScheme()
{
    return vscode.workspace.getConfiguration( 'taskvision.highlights' ).backgroundColourScheme;
}

function defaultHighlight()
{
    return vscode.workspace.getConfiguration( 'taskvision.highlights' ).defaultHighlight;
}

function customHighlight()
{
    return vscode.workspace.getConfiguration( 'taskvision.highlights' ).customHighlight;
}

function subTagClickUrl()
{
    return vscode.workspace.getConfiguration( 'taskvision.tree' ).subTagClickUrl;
}

function shouldShowIconsInsteadOfTagsInStatusBar()
{
    return vscode.workspace.getConfiguration( 'taskvision.general' ).showIconsInsteadOfTagsInStatusBar;
}

function shouldShowActivityBarBadge()
{
    return vscode.workspace.getConfiguration( 'taskvision.general' ).showActivityBarBadge;
}

module.exports.init = init;
module.exports.shouldGroupByTag = shouldGroupByTag;
module.exports.shouldGroupBySubTag = shouldGroupBySubTag;
module.exports.shouldExpand = shouldExpand;
module.exports.shouldFlatten = shouldFlatten;
module.exports.shouldShowTagsOnly = shouldShowTagsOnly;
module.exports.shouldShowCounts = shouldShowCounts;
module.exports.shouldHideIconsWhenGroupedByTag = shouldHideIconsWhenGroupedByTag;
module.exports.showFilterCaseSensitive = showFilterCaseSensitive;
module.exports.isRegexCaseSensitive = isRegexCaseSensitive;
module.exports.showBadges = showBadges;
module.exports.regex = regex;
module.exports.subTagRegex = subTagRegex;
module.exports.ripgrepPath = ripgrepPath;
module.exports.tags = tags;
module.exports.shouldSortTagsOnlyViewAlphabetically = shouldSortTagsOnlyViewAlphabetically;
module.exports.labelFormat = labelFormat;
module.exports.tooltipFormat = tooltipFormat;
module.exports.clickingStatusBarShouldRevealTree = clickingStatusBarShouldRevealTree;
module.exports.clickingStatusBarShouldToggleHighlights = clickingStatusBarShouldToggleHighlights;
module.exports.isValidScheme = isValidScheme;
module.exports.shouldIgnoreGitSubmodules = shouldIgnoreGitSubmodules;
module.exports.refreshTagGroupLookup = refreshTagGroupLookup;
module.exports.tagGroup = tagGroup;
module.exports.shouldCompactFolders = shouldCompactFolders;
module.exports.shouldUseBuiltInFileExcludes = shouldUseBuiltInFileExcludes;
module.exports.shouldUseBuiltInSearchExcludes = shouldUseBuiltInSearchExcludes;
module.exports.shouldHideFromTree = shouldHideFromTree;
module.exports.shouldHideFromStatusBar = shouldHideFromStatusBar;
module.exports.shouldHideFromActivityBar = shouldHideFromActivityBar;
module.exports.shouldSortTree = shouldSortTree;
module.exports.scanMode = scanMode;
module.exports.shouldShowScanModeInTree = shouldShowScanModeInTree;
module.exports.shouldUseColourScheme = shouldUseColourScheme;
module.exports.foregroundColourScheme = foregroundColourScheme;
module.exports.backgroundColourScheme = backgroundColourScheme;
module.exports.defaultHighlight = defaultHighlight;
module.exports.customHighlight = customHighlight;
module.exports.subTagClickUrl = subTagClickUrl;
module.exports.shouldShowIconsInsteadOfTagsInStatusBar = shouldShowIconsInsteadOfTagsInStatusBar;
module.exports.shouldShowActivityBarBadge = shouldShowActivityBarBadge;
