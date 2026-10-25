import path from 'node:path';
import ts from 'typescript-parser';
import type { SourceResult, SourceSymbol } from '../../shared/src/types';

export interface Comment {
  prefix: string;
  body: string;
  suffix: string;
}
export interface Analysis {
  comments: Map<number, Comment>;
  symbols: SourceSymbol[];
  imports: string[];
  provenance: string;
}
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
interface LexicalState {
  block?: boolean;
  longString?: string;
}
// Reused from the original scanner for languages without a syntax backend.
function lexicalComment(line: string, ext: string, state: LexicalState): Comment | null {
  if (state.longString) {
    if (line.includes(state.longString)) state.longString = undefined;
    return null;
  }
  if (state.block) {
    if (line.includes('*/')) state.block = false;
    const match = /^(\s*\*?\s*)(.*?)(\s*\*\/.*)?$/.exec(line);
    return match ? { prefix: match[1], body: match[2], suffix: match[3] || '' } : null;
  }
  const prefixes = ['.py', '.sh', '.bash', '.zsh', '.rb', '.yaml', '.yml', '.toml'].includes(ext)
    ? /^(\s*#\s*)(.*)$/
    : ext === '.sql'
      ? /^(\s*--\s*)(.*)$/
      : ['.md', '.mdx', '.html'].includes(ext)
        ? /^(\s*<!--\s*)(.*?)(\s*-->\s*)?$/
        : /^(\s*(?:\/\/|\/\*)\s*)(.*?)(\s*\*\/\s*)?$/;
  const match = prefixes.exec(line);
  if (match) {
    if (match[1].includes('/*') && !line.includes('*/')) state.block = true;
    return { prefix: match[1], body: match[2], suffix: match[3] || '' };
  }
  if (ext === '.py') {
    const triple = /('''|""")/.exec(line);
    if (triple && line.indexOf(triple[1], triple.index + 3) < 0) state.longString = triple[1];
  }
  return null;
}
function lexicalAnalysis(source: SourceResult): Analysis {
  const comments = new Map<number, Comment>(),
    symbols: SourceSymbol[] = [],
    imports: string[] = [],
    state: LexicalState = {};
  const ext = path.extname(source.path).toLowerCase();
  source.text.split(/\r?\n/).forEach((line, index) => {
    const comment = lexicalComment(line, ext, state);
    if (comment) comments.set(index + 1, comment);
    else if (!state.block && !state.longString) {
      const symbol =
        /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|def|fn|module)\s+([\w$]+)/.exec(
          line,
        );
      if (symbol) symbols.push({ name: symbol[1], line: index + 1, kind: 'lexical-symbol' });
      const dependency = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/.exec(line);
      if (dependency) imports.push(dependency[1]);
    }
  });
  return { comments, symbols, imports, provenance: 'lexical-static-import' };
}
/** Parse source text directly; project configuration and plugins are never loaded. */
export function analyzeSyntax(source: SourceResult): Analysis {
  const ext = path.extname(source.path).toLowerCase();
  if (!JS_EXTENSIONS.has(ext)) return lexicalAnalysis(source);
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const comments = new Map<number, Comment>(),
    symbols: SourceSymbol[] = [],
    imports: string[] = [];
  const ranges = new Map<number, ts.CommentRange>();
  function collect(node: ts.Node): void {
    for (const range of ts.getLeadingCommentRanges(file.text, node.pos) || [])
      ranges.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(file.text, node.end) || [])
      ranges.set(range.pos, range);
    let name: ts.Node | undefined,
      kind = '';
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isMethodDeclaration(node)
    ) {
      name = node.name;
      kind = ts.isFunctionDeclaration(node)
        ? 'function'
        : ts.isClassDeclaration(node)
          ? 'class'
          : ts.isInterfaceDeclaration(node)
            ? 'interface'
            : ts.isEnumDeclaration(node)
              ? 'enum'
              : ts.isTypeAliasDeclaration(node)
                ? 'type'
                : 'method';
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name;
      kind = 'function';
    }
    if (name)
      symbols.push({
        name: name.getText(file),
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        endLine: file.getLineAndCharacterOfPosition(node.end).line + 1,
        kind,
      });
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword)
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) imports.push(argument.text);
    }
    node.forEachChild(collect);
  }
  collect(file);
  // EOF owns comments in a comment-only file or after the final statement.
  for (const range of ts.getLeadingCommentRanges(file.text, file.endOfFileToken.pos) || [])
    ranges.set(range.pos, range);
  const lines = source.text.split(/\r?\n/);
  for (const range of ranges.values()) {
    const start = file.getLineAndCharacterOfPosition(range.pos),
      end = file.getLineAndCharacterOfPosition(range.end);
    for (let index = start.line; index <= end.line; index++) {
      const line = lines[index];
      if (index === start.line && line.slice(0, start.character).trim()) continue;
      const match = (
        index === start.line
          ? /^(\s*(?:\/\/|\/\*)\s*)(.*?)(\s*\*\/\s*)?$/
          : /^(\s*\*?\s*)(.*?)(\s*\*\/.*)?$/
      ).exec(line);
      if (match)
        comments.set(index + 1, { prefix: match[1], body: match[2], suffix: match[3] || '' });
    }
  }
  return {
    comments,
    symbols,
    imports: imports.filter((i) => i.startsWith('.')),
    provenance: 'typescript-ast-import',
  };
}
