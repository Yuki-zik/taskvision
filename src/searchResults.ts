import type { SearchResult } from './model';
import * as path from 'path';

let searchResults: SearchResult[] = [];

function clear() {
  searchResults = [];
}

function add(result: SearchResult) {
  searchResults.push(result);
}

function uriKey(uri: Pick<import('vscode').Uri, 'toString'> | undefined | null) {
  if (uri === undefined || uri === null) {
    return uri;
  }

  return uri.toString ? uri.toString() : uri;
}

function remove(uri: import('vscode').Uri) {
  const key = uriKey(uri);
  searchResults = searchResults.filter(function (match) {
    return uriKey(match.uri) !== key;
  });
}

function addToTree(tree: { add(result: SearchResult): void }) {
  searchResults.map(function (match) {
    if (match.added !== true) {
      tree.add(match);
      match.added = true;
    }
  });
}

function containsMarkdown() {
  return (
    searchResults.filter(function (match) {
      return path.extname(match.uri.fsPath) === '.md';
    }).length > 0
  );
}

function count() {
  return searchResults.length;
}

function contains(result: SearchResult) {
  const key = uriKey(result.uri);
  return (
    searchResults.filter(function (match) {
      return (
        uriKey(match.uri) === key && match.line == result.line && match.column == result.column
      );
    }).length > 0
  );
}

function markAsNotAdded() {
  searchResults.forEach(function (match) {
    match.added = false;
  });
}

function filter(filterFunction: (result: SearchResult) => boolean) {
  searchResults = searchResults.filter(filterFunction);
}

export { clear, add, remove, addToTree, containsMarkdown, count, contains, markAsNotAdded, filter };
