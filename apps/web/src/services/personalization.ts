export interface GraphViewportState {
  x: number;
  y: number;
  zoom: number;
}
export interface GraphCanvasState {
  positions: Record<string, { x: number; y: number }>;
  viewport?: GraphViewportState;
}
export interface PersonalPreferences {
  theme: 'system' | 'dark' | 'light';
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  detailDock: 'right' | 'left' | 'bottom';
  detailWidth: number;
  detailHeight: number;
  graphViews: Record<string, GraphCanvasState>;
}
export type PreferencePatch = Partial<PersonalPreferences>;
export const DEFAULT_PREFERENCES: PersonalPreferences = {
  theme: 'dark',
  sidebarWidth: 184,
  sidebarCollapsed: false,
  detailDock: 'right',
  detailWidth: 364,
  detailHeight: 300,
  graphViews: {},
};
export function normalizePreferences(value: unknown): PersonalPreferences {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const width = (key: string, fallback: number, minimum: number, maximum: number) =>
    typeof v[key] === 'number' && Number.isFinite(v[key])
      ? Math.min(maximum, Math.max(minimum, Math.round(v[key] as number)))
      : fallback;
  return {
    theme: v.theme === 'dark' || v.theme === 'light' || v.theme === 'system' ? v.theme : 'dark',
    sidebarWidth: width('sidebarWidth', 184, 160, 340),
    sidebarCollapsed: v.sidebarCollapsed === true,
    detailDock:
      v.detailDock === 'left' || v.detailDock === 'bottom' || v.detailDock === 'right'
        ? v.detailDock
        : 'right',
    detailWidth: width('detailWidth', 364, 290, 740),
    detailHeight: width('detailHeight', 300, 220, 2000),
    graphViews: boundGraphViews(v.graphViews),
  };
}
export function systemTheme(
  theme: PersonalPreferences['theme'],
  systemDark: boolean,
): 'dark' | 'light' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

// Match the server's finite coordinate, key and collection limits; reserve JSON
// space below its 256 KiB request budget for layout and theme fields.
export function boundGraphViews(value: unknown): Record<string, GraphCanvasState> {
  const views: Record<string, GraphCanvasState> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return views;
  const safeKey = (key: string) =>
    key.length > 0 && key.length <= 512 && !['__proto__', 'constructor', 'prototype'].includes(key);
  const coordinate = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000;
  const encoder = new TextEncoder();
  const budget = 220 * 1024;
  const sizes = new Map<string, number>();
  let total = 2;
  for (const [key, candidate] of Object.entries(value).slice(-32)) {
    if (!safeKey(key) || !candidate || typeof candidate !== 'object') continue;
    const state = candidate as GraphCanvasState;
    const positions: GraphCanvasState['positions'] = Object.create(null);
    const next: GraphCanvasState = { positions };
    const vp = state.viewport;
    if (
      vp &&
      coordinate(vp.x) &&
      coordinate(vp.y) &&
      typeof vp.zoom === 'number' &&
      Number.isFinite(vp.zoom) &&
      vp.zoom >= 0.05 &&
      vp.zoom <= 4
    )
      next.viewport = { x: vp.x, y: vp.y, zoom: vp.zoom };
    let size = encoder.encode(JSON.stringify(key) + ':' + JSON.stringify(next)).length + 1;
    if (state.positions && typeof state.positions === 'object') {
      let count = 0;
      for (const [id, point] of Object.entries(state.positions).slice(0, 2000)) {
        if (!safeKey(id) || !point || !coordinate(point.x) || !coordinate(point.y)) continue;
        const position = { x: point.x, y: point.y };
        const addition =
          encoder.encode(JSON.stringify(id) + ':' + JSON.stringify(position)).length +
          (count ? 1 : 0);
        if (size + addition > budget - 2) continue;
        positions[id] = position;
        size += addition;
        count++;
      }
    }
    // Retain recently used scopes and evict whole older scopes in linear time.
    while (total + size > budget && sizes.size) {
      const [oldest, bytes] = sizes.entries().next().value!;
      delete views[oldest];
      sizes.delete(oldest);
      total -= bytes;
    }
    views[key] = next;
    sizes.set(key, size);
    total += size;
  }
  return views;
}
