import type {Logger} from './model';
import {errorMessage} from './validation';
export interface SearchOptions {regex?: string; unquotedRegex?: string; rgPath?: string; globs?: string[]; additional?: string; filename?: string; outputChannel?: Pick<import('vscode').OutputChannel, 'appendLine'>; maxBuffer?: number; multiline?: boolean; patternFilePath?: string}
export interface ScannerMatch { fsPath: string; line: number; column: number; match: string; uri?: import("vscode").Uri; extraLines?: ScannerMatch[] }
export interface SearchMatches extends Array<Match> {truncated?: boolean; maxBuffer?: number}

/**
 * This is a modified version of the ripgrep-js module from npm
 * written by alexlafroscia (github.com/alexlafroscia/ripgrep-js)
 * Instead of assuming that ripgrep is in the users path, it uses the
 * ripgrep binary downloaded via vscode-ripgrep.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as utils from './utils';

const activeProcesses: child_process.ChildProcess[] = [];
const DEFAULT_MAX_BUFFER_KB = 10240;

function removeActiveProcess(proc: child_process.ChildProcess)
{
    const index = activeProcesses.indexOf( proc );
    if( index !== -1 )
    {
        activeProcesses.splice( index, 1 );
    }
}

class RipgrepError extends Error {
    constructor(message: string, public readonly stderr: string) { super(message); this.name = "RipgrepError"; }
}

function formatResults(stdout: string, multiline?: boolean): SearchMatches
{
    stdout = stdout.trim();

    if( !stdout )
    {
        return [];
    }

    if( multiline === true )
    {
        const results: SearchMatches = [];
        const regex = utils.getRegexForEditorSearch( true );
        const lines = stdout.split( '\n' );

        let buffer: string[] = [];
        let matches: Match[] = [];
        let text = "";

        lines.map( function( line )
        {
            let resultMatch = new Match( line );
            buffer.push( line );
            matches.push( resultMatch );

            text = ( text === "" ) ? resultMatch.match : text + '\n' + resultMatch.match;

            const fullMatch = text.match( regex );
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

function parseAdditionalArgs(additional?: string)
{
    if( typeof additional !== 'string' || additional.trim() === '' )
    {
        return [];
    }

    const args = [];
    const tokenRegex = /[^\s"']+|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    let match;
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

function quoteArg(arg: string | undefined | null)
{
    if( arg === undefined || arg === null )
    {
        return "";
    }

    const text = String( arg );
    return /\s/.test( text ) ? '"' + text.replace( /"/g, '\\"' ) + '"' : text;
}

function ensurePatternFile(options: SearchOptions, debug: Logger)
{
    if( !options.patternFilePath )
    {
        return false;
    }

    try
    {
        const parentFolder = path.dirname( options.patternFilePath );
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
        debug( "Failed writing pattern file - fallback to -e regex: " + errorMessage(e) );
        return false;
    }
}

function buildArgs(options: SearchOptions, debug: Logger)
{
    let args = [
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

    const usePatternFile = ensurePatternFile( options, debug );
    if( usePatternFile )
    {
        args.push( '-f', options.patternFilePath! );
        debug( "Pattern:" + options.unquotedRegex );
    }
    else
    {
        const regex = options.unquotedRegex || options.regex || '';
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

function cleanupPatternFile(patternFilePath?: string)
{
    if( patternFilePath && fs.existsSync( patternFilePath ) === true )
    {
        fs.unlinkSync( patternFilePath );
    }
}

export function search(cwd: string, options: SearchOptions): Promise<SearchMatches>
{
    function debug(text: string)
    {
        if( options.outputChannel )
        {
            const now = new Date();
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
    const rgPath = options.rgPath;

    if( !rgPath || !fs.existsSync( rgPath ) )
    {
        return Promise.reject( { error: "ripgrep executable not found (" + rgPath + ")" } );
    }
    if( !fs.existsSync( cwd ) )
    {
        return Promise.reject( { error: "root folder not found (" + cwd + ")" } );
    }

    const args = buildArgs( options, debug );
    debug( "Command: " + [ rgPath ].concat( args.map( quoteArg ) ).join( ' ' ) );

    return new Promise( function( resolve, reject )
    {
        const maxBufferKB = ( options.maxBuffer || DEFAULT_MAX_BUFFER_KB );
        const maxBuffer = maxBufferKB * 1024;
        let results = "";
        let errors = "";
        let hasCompleted = false;
        let truncated = false;

        const rgProcess = child_process.spawn( rgPath!, args, {
            cwd: cwd,
            shell: false,
            windowsHide: true
        } );
        activeProcesses.push( rgProcess );

        rgProcess.stdout.setEncoding( 'utf8' );
        rgProcess.stderr.setEncoding( 'utf8' );

        function fail(error: string, stderr: string)
        {
            if( hasCompleted )
            {
                return;
            }
            hasCompleted = true;
            cleanupPatternFile( options.patternFilePath );
            removeActiveProcess( rgProcess );
            reject( new RipgrepError( error, stderr ) );
        }

        rgProcess.stdout.on( 'data', function( data )
        {
            if( truncated )
            {
                return;
            }
            debug( "Search results:\n" + data );
            results += data;
            if( Buffer.byteLength( results, 'utf8' ) > maxBuffer )
            {
                // Rather than rejecting (which would leave the tree empty on
                // large repos), flag the result as truncated, stop the search
                // and let the 'close' handler resolve with the partial matches.
                truncated = true;
                debug( "Search output exceeded maxBuffer of " + maxBufferKB + " KB - returning partial results. Raise 'taskvision.ripgrep.ripgrepMaxBuffer' to collect more tags." );
                rgProcess.kill( 'SIGINT' );
            }
        } );

        rgProcess.stderr.on( 'data', function( data )
        {
            debug( "Search failed:\n" + data );
            errors += data;
        } );

        rgProcess.on( 'error', function( error )
        {
            fail( error.message, errors );
        } );

        rgProcess.on( 'close', function( code, signal )
        {
            if( hasCompleted )
            {
                return;
            }

            hasCompleted = true;
            cleanupPatternFile( options.patternFilePath );
            removeActiveProcess( rgProcess );

            if( truncated )
            {
                // Partial results collected before the buffer limit are still
                // useful. Resolve them with a marker so callers can warn the
                // user instead of discarding every tag. This takes priority
                // over the SIGINT we sent to stop the search.
                const partial = formatResults( results, options.multiline );
                partial.truncated = true;
                partial.maxBuffer = maxBufferKB;
                resolve( partial );
                return;
            }

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

            const stderr = errors.trim();
            reject( new RipgrepError( "Search failed with exit code " + code, stderr ) );
        } );

    } );
};

export function kill()
{
    activeProcesses.slice().forEach( function( proc )
    {
        try
        {
            proc.kill( 'SIGINT' );
        }
        catch( e )
        {
            try
            {
                proc.kill();
            }
            catch( ignored )
            {
            }
        }
    } );
};

class Match implements ScannerMatch
{
    fsPath: string; line: number; column: number; match: string; uri?: import("vscode").Uri; extraLines?: Match[];
    constructor( matchText: string )
    {
        // Detect file, line number and column which is formatted in the
        // following format: {file}:{line}:{column}:{code match}
        const regex = RegExp( /^(?<file>.*):(?<line>\d+):(?<column>\d+):(?<todo>.*)/ );

        const match = regex.exec( matchText );
        if( match && match.groups )
        {
            this.fsPath = match.groups.file;
            this.line = parseInt( match.groups.line, 10 );
            this.column = parseInt( match.groups.column, 10 );
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
            const parts = matchText.split( ':' );
            const hasColumn = ( parts.length === 4 );
            this.fsPath += parts.shift();
            this.line = parseInt( parts.shift() || '', 10 );
            if( hasColumn === true )
            {
                this.column = parseInt( parts.shift() || '', 10 );
            }
            else
            {
                this.column = 1;
            }
            this.match = parts.join( ':' );

        }

        if( isNaN( this.line ) )
        {
            this.line = 0;
        }
        if( isNaN( this.column ) )
        {
            this.column = 1;
        }
    }
}

export { Match, parseAdditionalArgs as _parseAdditionalArgs, buildArgs as _buildArgs, DEFAULT_MAX_BUFFER_KB as _defaultMaxBufferKb };
