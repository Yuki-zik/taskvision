/** Shared measured geometry; zoom changes content, never node position or ports. */
export const NODE_SIZES = {
  module: { overview: { width: 304, height: 196 }, detailed: { width: 328, height: 248 } },
  file: { overview: { width: 292, height: 184 }, detailed: { width: 316, height: 236 } },
} as const;
export type NodeReadingMode = 'map' | 'overview' | 'detail';
export const MAP_ZOOM_THRESHOLD = 0.48;
export function readingMode(zoom: number, detailed: boolean): NodeReadingMode {
  return zoom < MAP_ZOOM_THRESHOLD ? 'map' : detailed ? 'detail' : 'overview';
}
export function nodeSize(kind: 'module' | 'file', detailed: boolean) {
  return NODE_SIZES[kind][detailed ? 'detailed' : 'overview'];
}
