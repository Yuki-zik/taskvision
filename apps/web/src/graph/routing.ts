import type { RoutePoint } from './model';

// ELK geometry is only a startup fallback. A moved endpoint invalidates it.
export function matchingRoute(
  points: RoutePoint[] | undefined,
  source: RoutePoint,
  target: RoutePoint,
): RoutePoint[] | undefined {
  if (!points || points.length < 2) return undefined;
  const first = points[0]!,
    last = points.at(-1)!;
  return Math.abs(first.x - source.x) < 3 &&
    Math.abs(first.y - source.y) < 3 &&
    Math.abs(last.x - target.x) < 3 &&
    Math.abs(last.y - target.y) < 3
    ? points
    : undefined;
}

// Round an existing ELK polyline; routing itself belongs to ELK / Smart Edge.
export function roundedRoute(points: RoutePoint[], radius = 12): string {
  const first = points[0];
  if (!first) return '';
  let path = `M ${first.x},${first.y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1]!,
      corner = points[index]!,
      after = points[index + 1]!;
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y);
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y);
    if (!incoming || !outgoing) continue;
    const distance = Math.min(radius, incoming / 2, outgoing / 2);
    const start = {
      x: corner.x + ((before.x - corner.x) * distance) / incoming,
      y: corner.y + ((before.y - corner.y) * distance) / incoming,
    };
    const end = {
      x: corner.x + ((after.x - corner.x) * distance) / outgoing,
      y: corner.y + ((after.y - corner.y) * distance) / outgoing,
    };
    path += ` L ${start.x},${start.y} Q ${corner.x},${corner.y} ${end.x},${end.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x},${last.y}`;
}

export function routeMidpoint(points: RoutePoint[]): RoutePoint {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (length && remaining <= length) {
      const start = points[index]!,
        end = points[index + 1]!;
      return {
        x: start.x + ((end.x - start.x) * remaining) / length,
        y: start.y + ((end.y - start.y) * remaining) / length,
      };
    }
    remaining -= length;
  }
  return points[0] ?? { x: 0, y: 0 };
}

/**
 * A two-cubic wire for unobstructed corridors. The joined sections share a
 * horizontal tangent. Distinct midline offsets separate parallel wires.
 * If any other node intersects the curve, use Smart Edge/ELK instead.
 */
export interface WireObstacle {
  id: string;
  position: RoutePoint;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
}
export interface WireCableInput {
  source: RoutePoint;
  target: RoutePoint;
  sourceId: string;
  targetId: string;
  laneIndex?: number;
  laneCount?: number;
  padding?: number;
}
export interface WireCablePath {
  path: string;
  center: RoutePoint;
  laneOffset: number;
  segments: readonly [
    readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint],
    readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint],
  ];
}
export function cubicPoint(
  [p0, p1, p2, p3]: readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint],
  t: number,
): RoutePoint {
  const a = 1 - t;
  return {
    x: a * a * a * p0.x + 3 * a * a * t * p1.x + 3 * a * t * t * p2.x + t * t * t * p3.x,
    y: a * a * a * p0.y + 3 * a * a * t * p1.y + 3 * a * t * t * p2.y + t * t * t * p3.y,
  };
}
export function cableLaneOffset(index = 0, total = 1): number {
  if (total <= 1) return 0;
  const rank = Math.min(Math.max(index, 0), total - 1) - (total - 1) / 2;
  return rank * 18;
}
export function separatedCable(
  input: WireCableInput,
  obstacles: readonly WireObstacle[],
): WireCablePath | undefined {
  const { source, target, sourceId, targetId } = input;
  const dx = target.x - source.x;
  if (!Number.isFinite(dx) || dx < 72) return undefined;
  const laneOffset = cableLaneOffset(input.laneIndex, input.laneCount);
  const mid: RoutePoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2 + laneOffset,
  };
  const reach = Math.min(148, Math.max(28, dx * 0.29));
  const first: readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint] = [
    source,
    { x: source.x + reach, y: source.y },
    { x: mid.x - reach / 2, y: mid.y },
    mid,
  ];
  const second: readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint] = [
    mid,
    { x: mid.x + reach / 2, y: mid.y },
    { x: target.x - reach, y: target.y },
    target,
  ];
  const padding = input.padding ?? 12;
  for (const box of obstacles) {
    if (box.id === sourceId || box.id === targetId) continue;
    const width = box.width ?? box.measured?.width ?? 0;
    const height = box.height ?? box.measured?.height ?? 0;
    const left = box.position.x - padding;
    const right = box.position.x + width + padding;
    const top = box.position.y - padding;
    const bottom = box.position.y + height + padding;
    for (const segment of [first, second]) {
      for (let step = 0; step <= 32; step++) {
        const p = cubicPoint(segment, step / 32);
        if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
          return undefined;
        }
      }
    }
  }
  const repr = (point: RoutePoint) => point.x + ',' + point.y;
  return {
    path:
      'M ' +
      repr(source) +
      ' C ' +
      repr(first[1]) +
      ' ' +
      repr(first[2]) +
      ' ' +
      repr(mid) +
      ' C ' +
      repr(second[1]) +
      ' ' +
      repr(second[2]) +
      ' ' +
      repr(target),
    center: mid,
    laneOffset,
    segments: [first, second],
  };
}

/**
 * Distinct collision-free corridors for parallel wires when the direct curve
 * is blocked. Smart Edge v5 routes every segment through these two waypoints
 * using its existing A* solver. Coordinates are deliberately outside the
 * envelope of actual interfering modules, not guessed freehand over a node.
 *
 * For very dense fans the UI already exposes category/neighbour focus; do not
 * create unbounded detours for 40+ wires or pretend unlimited screen space.
 */
export function obstacleLaneWaypoints(
  input: WireCableInput,
  obstacles: readonly WireObstacle[],
): RoutePoint[] {
  const { source, target, sourceId, targetId } = input;
  const count = input.laneCount ?? 1;
  const index = input.laneIndex ?? 0;
  const dx = target.x - source.x;
  if (count <= 1 || count > 10 || dx < 150) return [];
  const padding = input.padding ?? 13;
  const topRange = Math.min(source.y, target.y) - 150;
  const bottomRange = Math.max(source.y, target.y) + 150;
  const interfering = obstacles
    .filter((node) => node.id !== sourceId && node.id !== targetId)
    .map((node) => ({
      x: node.position.x,
      y: node.position.y,
      right: node.position.x + (node.width ?? node.measured?.width ?? 0),
      bottom: node.position.y + (node.height ?? node.measured?.height ?? 0),
    }))
    .filter(
      (box) =>
        box.x < target.x - padding &&
        box.right > source.x + padding &&
        box.y < bottomRange &&
        box.bottom > topRange,
    );
  if (!interfering.length) return [];
  const left = Math.min(...interfering.map((box) => box.x));
  const right = Math.max(...interfering.map((box) => box.right));
  const top = Math.min(...interfering.map((box) => box.y));
  const bottom = Math.max(...interfering.map((box) => box.bottom));
  if (bottom - top > 700) return [];
  const averageY = (source.y + target.y) / 2;
  const above = top - padding - 22;
  const below = bottom + padding + 22;
  const useAbove = Math.abs(averageY - above) <= Math.abs(averageY - below);
  // 20px > two Smart Edge grid cells (8px each), so snapping cannot collapse
  // neighboring waypoints onto the same horizontal corridor.
  const spread = Math.min(Math.max(index, 0), count - 1) * 20;
  const laneY = useAbove ? above - spread : below + spread;
  const corridorInset = Math.min(48, dx / 4);
  const firstX = Math.max(source.x + corridorInset, left - padding - 18);
  const secondX = Math.min(target.x - corridorInset, right + padding + 18);
  if (firstX >= secondX - 25) return [{ x: (source.x + target.x) / 2, y: laneY }];
  return [
    { x: firstX, y: laneY },
    { x: secondX, y: laneY },
  ];
}
