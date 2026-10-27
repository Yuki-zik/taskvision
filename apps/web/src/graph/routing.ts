import type { RoutePoint } from './model';
import { cubicHitsBox, finitePoint, splitCubic, type Cubic, type RouteBox } from './route-geometry';

// ELK geometry is only a startup fallback. A moved endpoint invalidates it.
export function matchingRoute(
  points: RoutePoint[] | undefined,
  source: RoutePoint,
  target: RoutePoint,
): RoutePoint[] | undefined {
  if (
    !points ||
    points.length < 2 ||
    !points.every(finitePoint) ||
    !finitePoint(source) ||
    !finitePoint(target)
  )
    return undefined;
  const first = points[0]!,
    last = points.at(-1)!;
  // ELK ports are card-border centers while React Flow attaches to the
  // outward perimeter of a6–8px socket (up to4px horizontal offset). This
  // measurement difference is not a stale route; retain its geometry and
  // anchor only its endpoints. Real node moves still invalidate the route.
  if (
    Math.abs(first.x - source.x) > 5 ||
    Math.abs(first.y - source.y) > 1 ||
    Math.abs(last.x - target.x) > 5 ||
    Math.abs(last.y - target.y) > 1
  )
    return undefined;
  if (first.x === source.x && first.y === source.y && last.x === target.x && last.y === target.y)
    return points;
  return [{ ...source }, ...points.slice(1, -1), { ...target }];
}

// Round an existing ELK polyline; routing itself belongs to ELK / Smart Edge.
export function roundedRoute(points: RoutePoint[], radius = 12): string {
  points = simplifyRoute(points);
  radius = Number.isFinite(radius) ? Math.max(0, Math.min(64, radius)) : 12;
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

/** Clear corridors use a single cubic with horizontal endpoint tangents. */
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
  if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 1) return 0;
  const rank = Math.min(Math.max(index, 0), total - 1) - (total - 1) / 2;
  return rank * 18;
}
export function separatedCable(
  input: WireCableInput,
  obstacles: readonly WireObstacle[],
): WireCablePath | undefined {
  const { source, target, sourceId, targetId } = input;
  const dx = target.x - source.x;
  if (!finitePoint(source) || !finitePoint(target) || !Number.isFinite(dx) || dx < 72)
    return undefined;
  const sharedLevel = Math.abs(source.y - target.y) < 1e-6;
  const laneOffset = sharedLevel ? cableLaneOffset(input.laneIndex, input.laneCount) : 0;
  const reach = Math.min(148, dx * 0.42);
  const base: Cubic = [
    source,
    { x: source.x + reach, y: source.y },
    { x: target.x - reach, y: target.y },
    target,
  ];
  // Keep the public two-segment sampling contract. Both halves are exact
  // subdivisions of ONE cubic; the midpoint has the original sloped tangent.
  let segments = splitCubic(base);
  // Legacy shared sockets need an actual lane. Distinct sockets already provide
  // separation; bending them again can braid category wires near the hub.
  const deviates = laneOffset !== 0;
  if (deviates) {
    const mid = { x: (source.x + target.x) / 2, y: source.y + laneOffset };
    const tangent = Math.min(reach / 2, dx / 6);
    segments = [
      [source, base[1], { x: mid.x - tangent, y: mid.y }, mid],
      [mid, { x: mid.x + tangent, y: mid.y }, base[2], target],
    ];
  }
  const padding = Number.isFinite(input.padding) ? Math.max(0, input.padding!) : 12;
  for (const box of obstacles) {
    if (box.id === sourceId || box.id === targetId) continue;
    const bounds = obstacleBox(box, padding);
    if (segments.some((segment) => cubicHitsBox(segment, bounds))) return undefined;
  }
  return {
    path:
      `M ${repr(source)} ` + (deviates ? segments.map(cubicCommand).join(' ') : cubicCommand(base)),
    center: segments[0][3],
    laneOffset,
    segments,
  };
}

export type ConnectionStyle = 'flow' | 'orthogonal' | 'direct';
/** Both ELK objects and SmartEdge's raw number[][] are accepted without casts. */
export type RoutePoints = readonly (RoutePoint | readonly number[])[];
export interface DisplayedRoute {
  path: string;
  center: RoutePoint;
}
const repr = (point: RoutePoint): string => `${point.x},${point.y}`;
const cubicCommand = (curve: Cubic): string =>
  `C ${repr(curve[1])} ${repr(curve[2])} ${repr(curve[3])}`;
const samePoint = (a: RoutePoint, b: RoutePoint): boolean => a.x === b.x && a.y === b.y;
function obstacleBox(box: WireObstacle, padding = 0): RouteBox {
  return {
    left: box.position.x - padding,
    right: box.position.x + (box.measured?.width ?? box.width ?? 0) + padding,
    top: box.position.y - padding,
    bottom: box.position.y + (box.measured?.height ?? box.height ?? 0) + padding,
  };
}

/**
 * Only delete exact loops and collinear retraces. Every replacement line is a
 * subset of the original route; never shortcut a staircase across an obstacle.
 * Malformed coordinates invalidate the whole route rather than bridging a gap.
 */
export function simplifyRoute(input: RoutePoints): RoutePoint[] {
  const points = input.map((point) =>
    'x' in point ? { x: point.x, y: point.y } : { x: point[0]!, y: point[1]! },
  );
  if (!points.every(finitePoint)) return [];
  const cleaned: RoutePoint[] = [];
  for (const point of points) {
    const repeat = cleaned.findIndex((previous) => samePoint(previous, point));
    if (repeat >= 0) {
      cleaned.splice(repeat + 1);
      continue;
    }
    while (cleaned.length >= 2) {
      const a = cleaned.at(-2)!,
        b = cleaned.at(-1)!;
      const cross = (b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x);
      if (cross !== 0) break;
      cleaned.pop();
    }
    cleaned.push(point);
  }
  return cleaned;
}

/**
 * Present an already routed polyline. Flow uses bounded tangent-continuous
 * cubic rounds, orthogonal keeps sharp corners, direct is a literal straight
 * endpoint chord and MAY cross nodes. This never runs a second router.
 *
 * Pass live nodes as the fourth argument for large rounds: each corner is
 * shrunk until its curve clears every node, including endpoint node interiors.
 * Without boxes node clearance is the caller's responsibility: a padded
 * polyline alone does not prove that a large corner round will clear nodes.
 * SmartEdge raw points exclude handles; prepend/append the live handle points.
 */
export function displayRoute(
  input: RoutePoints,
  style: ConnectionStyle,
  radius = 36,
  obstacles: readonly WireObstacle[] = [],
): DisplayedRoute {
  const points = simplifyRoute(input);
  const first = points[0],
    last = points.at(-1);
  if (!first || !last) return { path: '', center: { x: 0, y: 0 } };
  if (style === 'direct')
    return {
      path: `M ${repr(first)} L ${repr(last)}`,
      center: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 },
    };
  let path = `M ${repr(first)}`;
  const sampled = [first];
  const maxRadius =
    style === 'flow' ? (Number.isFinite(radius) ? Math.min(64, Math.max(0, radius)) : 36) : 0;
  const boxes = obstacles.map((box) => obstacleBox(box));
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]!,
      corner = points[i]!,
      after = points[i + 1]!;
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y);
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y);
    let distance = Math.min(maxRadius, incoming / 2, outgoing / 2);
    let round: Cubic | undefined;
    while (distance >= 0.5) {
      const start = {
        x: corner.x + ((before.x - corner.x) * distance) / incoming,
        y: corner.y + ((before.y - corner.y) * distance) / incoming,
      };
      const end = {
        x: corner.x + ((after.x - corner.x) * distance) / outgoing,
        y: corner.y + ((after.y - corner.y) * distance) / outgoing,
      };
      // Quarter-circle approximation for orthogonal corners. It remains inside
      // the original corner triangle; there is no overshoot into adjacent leads.
      const k = 0.5522847498307936;
      const candidate: Cubic = [
        start,
        { x: start.x + (corner.x - start.x) * k, y: start.y + (corner.y - start.y) * k },
        { x: end.x + (corner.x - end.x) * k, y: end.y + (corner.y - end.y) * k },
        end,
      ];
      if (!boxes.some((box) => cubicHitsBox(candidate, box))) {
        round = candidate;
        break;
      }
      distance /= 2;
    }
    if (round) {
      path += ` L ${repr(round[0])} ${cubicCommand(round)}`;
      sampled.push(round[0]);
      for (let step = 1; step <= 16; step++) sampled.push(cubicPoint(round, step / 16));
    } else {
      path += ` L ${repr(corner)}`;
      sampled.push(corner);
    }
  }
  if (points.length > 1) {
    path += ` L ${repr(last)}`;
    sampled.push(last);
  }
  return { path, center: routeMidpoint(sampled) };
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
