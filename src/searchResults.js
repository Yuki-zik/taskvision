var path = require( 'path' );

var searchResults = [];

function clear()
{
    searchResults = [];
}

function add( result )
{
    searchResults.push( result );
}

function uriKey( uri )
{
    if( uri === undefined || uri === null )
    {
        return uri;
    }

    return uri.toString ? uri.toString() : uri;
}

function remove( uri )
{
    var key = uriKey( uri );
    searchResults = searchResults.filter( function( match )
    {
        return uriKey( match.uri ) !== key;
    } );
}

function addToTree( tree )
{
    searchResults.map( function( match )
    {
        if( match.added !== true )
        {
            tree.add( match );
            match.added = true;
        }
    } );
}

function containsMarkdown()
{
    return searchResults.filter( function( match )
    {
        return path.extname( match.uri.fsPath ) === '.md';
    } ).length > 0;
}

function count()
{
    return searchResults.length;
}

function contains( result )
{
    var key = uriKey( result.uri );
    return searchResults.filter( function( match )
    {
        return uriKey( match.uri ) === key && match.line == result.line && match.column == result.column;
    } ).length > 0;
}

function markAsNotAdded()
{
    searchResults.forEach( function( match )
    {
        match.added = false;
    } );
}

function filter( filterFunction )
{
    searchResults = searchResults.filter( filterFunction );
}

module.exports.clear = clear;
module.exports.add = add;
module.exports.remove = remove;
module.exports.addToTree = addToTree;
module.exports.containsMarkdown = containsMarkdown;
module.exports.count = count;
module.exports.contains = contains;
module.exports.markAsNotAdded = markAsNotAdded;
module.exports.filter = filter;
