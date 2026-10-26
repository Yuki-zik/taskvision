/** Shared measured geometry; zoom changes content, never node position or ports. */
export const NODE_SIZES = {
  module: { overview: { width: 264, height: 120 }, detailed: { width: 288, height: 184 } },
  file: { overview: { width: 252, height: 112 }, detailed: { width: 272, height: 176 } },
} as const;
export type NodeReadingMode = 'map' | 'overview' | 'detail';
export const MAP_ZOOM_THRESHOLD = 0.68;
export function readingMode(zoom: number, detailed: boolean): NodeReadingMode {
  return zoom < MAP_ZOOM_THRESHOLD ? 'map' : detailed ? 'detail' : 'overview';
}
export function nodeSize(kind: 'module' | 'file', detailed: boolean) {
  return NODE_SIZES[kind][detailed ? 'detailed' : 'overview'];
}
