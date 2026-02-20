/* jshint esversion:6, node: true */
/* eslint-env node */

/**
 * This is a modified version of the ripgrep-js module from npm
 * written by alexlafroscia (github.com/alexlafroscia/ripgrep-js)
 * Instead of assuming that ripgrep is in the users path, it uses the
 * ripgrep binary downloaded via vscode-ripgrep.
 */

'use strict';
const child_process = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );
const utils = require( './utils' );

var currentProcess;

function RipgrepError( error, stderr )
{
    this.message = error;
    this.stderr = stderr;
}

function formatResults( stdout, multiline )
{
    stdout = stdout.trim();

    if( !stdout )
    {
        return [];
    }

    if( multiline === true )
    {
        var results = [];
        var regex = utils.getRegexForEditorSearch( true );
        var lines = stdout.split( '\n' );

        var buffer = [];
        var matches = [];
        var text = "";

        lines.map( function( line )
        {
            var resultMatch = new Match( line );
            buffer.push( line );
            matches.push( resultMatch );

            text = ( text === "" ) ? resultMatch.match : text + '\n' + resultMatch.match;

            var fullMatch = text.match( regex );
            if( fullMatch )
            {
                resultMatch = matches[ 0 ];
                matches.shift();
                resultMatch.extraLines = matches;
                results.push( resultMatch );
                buffer = [];
                matches = [];
                text = "";
            }
        } );

        return results;
    }

    return stdout
        .split( '\n' )
        .map( ( line ) => new Match( line ) );
}

function parseAdditionalArgs( additional )
{
    if( typeof additional !== 'string' || additional.trim() === '' )
    {
        return [];
    }

    var args = [];
    var tokenRegex = /[^\s"']+|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    var match;
    while( ( match = tokenRegex.exec( additional ) ) !== null )
    {
        if( match[ 1 ] !== undefined )
        {
            args.push( match[ 1 ].replace( /\\"/g, '"' ) );
        }
        else if( match[ 2 ] !== undefined )
        {
            args.push( match[ 2 ].replace( /\\'/g, '\'' ) );
        }
        else
        {
            args.push( match[ 0 ] );
        }
    }
    return args;
}

function quoteArg( arg )
{
    if( arg === undefined || arg === null )
    {
        return "";
    }

    var text = String( arg );
    return /\s/.test( text ) ? '"' + text.replace( /"/g, '\\"' ) + '"' : text;
}

function ensurePatternFile( options, debug )
{
    if( !options.patternFilePath )
    {
        return false;
    }

    try
    {
        var parentFolder = path.dirname( options.patternFilePath );
        if( parentFolder && !fs.existsSync( parentFolder ) )
        {
            fs.mkdirSync( parentFolder, { recursive: true } );
        }

        debug( "Writing pattern file:" + options.patternFilePath );
        fs.writeFileSync( options.patternFilePath, options.unquotedRegex + '\n' );
        return fs.existsSync( options.patternFilePath );
    }
    catch( e )
    {
        debug( "Failed writing pattern file - fallback to -e regex: " + e.message );
        return false;
    }
}

function buildArgs( options, debug )
{
    var args = [
        '--no-messages',
        '--vimgrep',
        '-H',
        '--column',
        '--line-number',
        '--color',
        'never'
    ];

    args = args.concat( parseAdditionalArgs( options.additional ) );

    if( options.multiline )
    {
        args.push( '-U' );
    }

    var usePatternFile = ensurePatternFile( options, debug );
    if( usePatternFile )
    {
        args.push( '-f', options.patternFilePath );
        debug( "Pattern:" + options.unquotedRegex );
    }
    else
    {
        var regex = options.unquotedRegex || options.regex || '';
        args.push( '-e', regex );
        debug( "No pattern file found - passing regex in arguments" );
    }

    args = ( options.globs || [] ).reduce( function( list, glob )
    {
        list.push( '-g', glob );
        return list;
    }, args );

    if( options.filename )
    {
        args.push( options.filename );
    }
    else
    {
        args.push( '.' );
    }

    return args;
}

function cleanupPatternFile( patternFilePath )
{
    if( patternFilePath && fs.existsSync( patternFilePath ) === true )
    {
        fs.unlinkSync( patternFilePath );
    }
}

module.exports.search = function ripGrep( cwd, options )
{
    function debug( text )
    {
        if( options.outputChannel )
        {
            var now = new Date();
            options.outputChannel.appendLine( now.toLocaleTimeString( 'en', { hour12: false } ) + "." + String( now.getMilliseconds() ).padStart( 3, '0' ) + " " + text );
        }
    }

    if( !cwd )
    {
        return Promise.reject( { error: 'No `cwd` provided' } );
    }

    if( arguments.length === 1 )
    {
        return Promise.reject( { error: 'No search term provided' } );
    }

    options.regex = options.regex || '';
    options.globs = options.globs || [];
    options.unquotedRegex = options.unquotedRegex || options.regex;
    options.additional = options.additional || '';
    var rgPath = options.rgPath;

    if( !fs.existsSync( rgPath ) )
    {
        return Promise.reject( { error: "ripgrep executable not found (" + rgPath + ")" } );
    }
    if( !fs.existsSync( cwd ) )
    {
        return Promise.reject( { error: "root folder not found (" + cwd + ")" } );
    }

    var args = buildArgs( options, debug );
    debug( "Command: " + [ rgPath ].concat( args.map( quoteArg ) ).join( ' ' ) );

    return new Promise( function( resolve, reject )
    {
        const maxBuffer = ( options.maxBuffer || 200 ) * 1024;
        var results = "";
        var errors = "";
        var hasCompleted = false;

        currentProcess = child_process.spawn( rgPath, args, {
            cwd: cwd,
            shell: false,
            windowsHide: true
        } );

        currentProcess.stdout.setEncoding( 'utf8' );
        currentProcess.stderr.setEncoding( 'utf8' );

        function fail( error, stderr )
        {
            if( hasCompleted )
            {
                return;
            }
            hasCompleted = true;
            cleanupPatternFile( options.patternFilePath );
            currentProcess = undefined;
            reject( new RipgrepError( error, stderr ) );
        }

        currentProcess.stdout.on( 'data', function( data )
        {
            debug( "Search results:\n" + data );
            results += data;
            if( Buffer.byteLength( results, 'utf8' ) > maxBuffer )
            {
                currentProcess.kill( 'SIGINT' );
                fail( "Search output exceeded maxBuffer of " + ( options.maxBuffer || 200 ) + " KB", errors );
            }
        } );

        currentProcess.stderr.on( 'data', function( data )
        {
            debug( "Search failed:\n" + data );
            errors += data;
        } );

        currentProcess.on( 'error', function( error )
        {
            fail( error.message, errors );
        } );

        currentProcess.on( 'close', function( code, signal )
        {
            if( hasCompleted )
            {
                return;
            }

            hasCompleted = true;
            cleanupPatternFile( options.patternFilePath );
            currentProcess = undefined;

            if( signal )
            {
                reject( new RipgrepError( "Search interrupted (" + signal + ")", errors ) );
                return;
            }

            if( code === 0 || code === 1 )
            {
                resolve( formatResults( results, options.multiline ) );
                return;
            }

            var stderr = errors.trim();
            reject( new RipgrepError( "Search failed with exit code " + code, stderr ) );
        } );

    } );
};

module.exports.kill = function()
{
    if( currentProcess !== undefined )
    {
        try
        {
            currentProcess.kill( 'SIGINT' );
        }
        catch( e )
        {
            try
            {
                currentProcess.kill();
            }
            catch( ignored )
            {
            }
        }
    }
};

class Match
{
    constructor( matchText )
    {
        // Detect file, line number and column which is formatted in the
        // following format: {file}:{line}:{column}:{code match}
        var regex = RegExp( /^(?<file>.*):(?<line>\d+):(?<column>\d+):(?<todo>.*)/ );

        var match = regex.exec( matchText );
        if( match && match.groups )
        {
            this.fsPath = match.groups.file;
            this.line = parseInt( match.groups.line );
            this.column = parseInt( match.groups.column );
            this.match = match.groups.todo;
        }
        else // Fall back to old method
        {
            this.fsPath = "";

            if( matchText.length > 1 && matchText[ 1 ] === ':' )
            {
                this.fsPath = matchText.substr( 0, 2 );
                matchText = matchText.substr( 2 );
            }
            var parts = matchText.split( ':' );
            var hasColumn = ( parts.length === 4 );
            this.fsPath += parts.shift();
            this.line = parseInt( parts.shift() );
            if( hasColumn === true )
            {
                this.column = parseInt( parts.shift() );
            }
            else
            {
                this.column = 1;
            }
            this.match = parts.join( ':' );

        }
    }
}

module.exports.Match = Match;
module.exports._parseAdditionalArgs = parseAdditionalArgs;
module.exports._buildArgs = buildArgs;
