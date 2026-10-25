export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
  oldLine?: number;
  newLine?: number;
}

// CORE: Diff only the server's real baseline and current file. Bound LCS memory for large files.
export function diffLines(before: string | null, after: string | null): DiffLine[] {
  const oldLines = before === null || before === '' ? [] : before.split('\n');
  const newLines = after === null || after === '' ? [] : after.split('\n');
  if (oldLines.length * newLines.length > 1_000_000) {
    let start = 0,
      end = 0;
    while (
      start < Math.min(oldLines.length, newLines.length) &&
      oldLines[start] === newLines[start]
    )
      start++;
    while (
      end < Math.min(oldLines.length, newLines.length) - start &&
      oldLines[oldLines.length - end - 1] === newLines[newLines.length - end - 1]
    )
      end++;
    return [
      ...oldLines
        .slice(0, start)
        .map((text, i): DiffLine => ({ type: 'context', text, oldLine: i + 1, newLine: i + 1 })),
      ...oldLines
        .slice(start, oldLines.length - end)
        .map((text, i): DiffLine => ({ type: 'remove', text, oldLine: start + i + 1 })),
      ...newLines
        .slice(start, newLines.length - end)
        .map((text, i): DiffLine => ({ type: 'add', text, newLine: start + i + 1 })),
      ...newLines.slice(newLines.length - end).map((text, i): DiffLine => ({
        type: 'context',
        text,
        oldLine: oldLines.length - end + i + 1,
        newLine: newLines.length - end + i + 1,
      })),
    ];
  }
  const table = Array.from(
    { length: oldLines.length + 1 },
    () => new Uint32Array(newLines.length + 1),
  );
  for (let i = oldLines.length - 1; i >= 0; i--)
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i]![j] =
        oldLines[i] === newLines[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  const output: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      output.push({ type: 'context', text: oldLines[i]!, oldLine: ++i, newLine: ++j });
    } else if (
      i < oldLines.length &&
      (j >= newLines.length || table[i + 1]![j]! >= table[i]![j + 1]!)
    ) {
      output.push({ type: 'remove', text: oldLines[i]!, oldLine: ++i });
    } else output.push({ type: 'add', text: newLines[j]!, newLine: ++j });
  }
  return output;
}
