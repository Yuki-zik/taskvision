import type { RoutePoint } from './model';

export type Cubic = readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint];
export interface RouteBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const finitePoint = (point: RoutePoint): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);
const midpoint = (a: RoutePoint, b: RoutePoint): RoutePoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** Exact subdivision preserves the original curve and its join derivative. */
export function splitCubic([a, b, c, d]: Cubic): readonly [Cubic, Cubic] {
  const ab = midpoint(a, b),
    bc = midpoint(b, c),
    cd = midpoint(c, d);
  const abc = midpoint(ab, bc),
    bcd = midpoint(bc, cd);
  const mid = midpoint(abc, bcd);
  return [
    [a, ab, abc, mid],
    [mid, bcd, cd, d],
  ];
}

/**
 * Conservative hull subdivision, rather than point sampling: a thin obstacle
 * cannot hide between samples. An unresolved subpixel hull counts as blocked.
 */
export function cubicHitsBox(curve: Cubic, box: RouteBox, depth = 0): boolean {
  const left = Math.min(...curve.map((point) => point.x));
  const right = Math.max(...curve.map((point) => point.x));
  const top = Math.min(...curve.map((point) => point.y));
  const bottom = Math.max(...curve.map((point) => point.y));
  if (right <= box.left || left >= box.right || bottom <= box.top || top >= box.bottom)
    return false;
  if (depth >= 16 || Math.max(right - left, bottom - top) < 0.25) return true;
  const [first, second] = splitCubic(curve);
  return cubicHitsBox(first, box, depth + 1) || cubicHitsBox(second, box, depth + 1);
}
