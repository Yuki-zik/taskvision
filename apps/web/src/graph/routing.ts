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
