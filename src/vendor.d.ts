declare module 'micromatch' {
  export function isMatch(input: string, patterns: string | string[]): boolean;
}
declare module 'find' {
  export function fileSync(pattern: string, root: string): string[];
}
declare module 'fast-strftime' {
  export function strftime(template: string, date?: Date): string;
}
declare module 'regexp-match-indices' {
  export function shim(): void;
}
declare module 'treeify' {
  export function asTree(tree: object, showValues: boolean): string;
}
declare module 'comment-patterns' {
  interface Pattern {
    name?: string;
    singleLineComment?: { start: string }[];
    multiLineComment?: { start: string; end: string }[];
    regex?: RegExp;
    cg: { contentStart: number };
  }
  interface Patterns {
    (filename: string): Pattern;
    regex(filename: string): Pattern;
  }
  const patterns: Patterns;
  export default patterns;
}
declare module '@primer/octicons' {
  interface Octicon {
    toSVG(options?: { xmlns?: string; fill?: string; width?: number; height?: number }): string;
  }
  const octicons: Record<string, Octicon>;
  export default octicons;
}
