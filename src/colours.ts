import * as vscode from 'vscode';
import * as utils from './utils.js';

function validateColours(workspace: typeof vscode.workspace)
{
    function check(setting: string)
    {
        const definedColour = workspace.getConfiguration( 'taskvision.highlights' ).get( setting );
        if( definedColour !== undefined && !utils.isValidColour( definedColour ) )
        {
            invalidColours.push( setting + ' (' + definedColour + ')' );
        }
    }

    const invalidColours: string[] = [];
    let result = "";

    const attributeList = [ 'foreground', 'background', 'iconColour', 'rulerColour' ];
    attributeList.forEach( function( attribute ) { check( 'defaultHighlight.' + attribute ); } );

    const config = vscode.workspace.getConfiguration( 'taskvision.highlights' );
    Object.keys( config.get<Record<string, import('./model').HighlightSettings>>('customHighlight', {}) ).forEach( function( tag )
    {
        attributeList.forEach( function( attribute ) { check( 'customHighlight.' + tag + '.' + attribute ); } );
    } );

    if( invalidColours.length > 0 )
    {
        result = "Invalid colour settings: " + invalidColours.join( ', ' );
    }

    return result;
}

function validateIconColours(workspace: typeof vscode.workspace)
{
    let hasInvalidCodiconColour = false;
    let hasInvalidOcticonColour = false;

    function checkIconColour(setting: string)
    {
        const icon = workspace.getConfiguration( 'taskvision.highlights' ).get<string>( setting + ".icon" );
        const iconColour = workspace.getConfiguration( 'taskvision.highlights' ).get<string>( setting + ".iconColour" );
        if( icon !== undefined && iconColour !== undefined )
        {
            if( utils.isCodicon( icon ) )
            {
                if( utils.isHexColour( iconColour ) || utils.isRgbColour( iconColour ) || utils.isNamedColour( iconColour ) )
                {
                    invalidIconColours.push( setting + '.iconColour (' + iconColour + ')' );
                    hasInvalidCodiconColour = true;
                }
            }
            else
            {
                if( utils.isThemeColour( iconColour ) )
                {
                    invalidIconColours.push( setting + '.iconColour (' + iconColour + ')' );
                    hasInvalidOcticonColour = true;
                }
            }
        }
    }

    const invalidIconColours: string[] = [];
    let result = "";

    checkIconColour( 'defaultHighlight' );

    const config = vscode.workspace.getConfiguration( 'taskvision.highlights' );
    Object.keys( config.get<Record<string, import('./model').HighlightSettings>>('customHighlight', {}) ).forEach( function( tag )
    {
        checkIconColour( 'customHighlight.' + tag );
    } );

    if( invalidIconColours.length > 0 )
    {
        result = "Invalid icon colour settings: " + invalidIconColours.join( ', ' ) + ".";
        if( hasInvalidCodiconColour )
        {
            result += " Codicons can only use theme colours.";
        }
        if( hasInvalidOcticonColour )
        {
            result += " Theme colours can only be used with Codicons.";
        }
    }

    return result;
}

export { validateColours, validateIconColours };
