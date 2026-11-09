import type { Integer } from '../../../core/numbers';
import { orientXY } from '../../../core/predicates';
import type { Vec2 } from '../../../core/vec2';
import { Polygon2 } from '../../../geometry/regions/polygon2';

/**
 * The vertices of a convex polygon, counter-clockwise, without repeated or straight (collinear) vertices, starting
 * at the lowest vertex (leftmost on ties). From there the edge directions rise strictly through [0, 2π).
 * Throws when `polygon` is not convex.
 * @internal
 */
export function convexLoop(polygon: Polygon2): Vec2[] {
  if (!polygon.isConvex()) throw new Error('Minkowski2: the polygon is not convex');
  const ordered = polygon.signedArea() < 0 ? [...polygon.vertices].reverse() : [...polygon.vertices];
  const loop = withoutStraightVertices(ordered);

  let start = 0;
  for (let i = 1; i < loop.length; i++) {
    const v = loop[i]!;
    const s = loop[start]!;
    if (v.y < s.y || (v.y === s.y && v.x < s.x)) start = i;
  }
  return [...loop.slice(start), ...loop.slice(0, start)];
}

/**
 * `loop` without repeated vertices and without vertices where it does not turn left (exactly). Removes vertices
 * until every turn is strictly counter-clockwise.
 * @internal
 */
export function withoutStraightVertices(loop: readonly Vec2[]): Vec2[] {
  let result = [...loop];
  let changed = true;
  while (changed && result.length >= 3) {
    changed = false;
    const kept: Vec2[] = [];
    for (let i = 0; i < result.length; i++) {
      const previous = kept.length > 0 ? kept[kept.length - 1]! : result[result.length - 1]!;
      const current = result[i]!;
      const next = result[(i + 1) % result.length]!;
      if (orientXY(previous.x, previous.y, current.x, current.y, next.x, next.y) > 0) kept.push(current);
      else changed = true;
    }
    result = kept;
  }
  return result;
}

/**
 * Order of two edge directions by angle in [0, 2π): negative when `a` comes first, 0 when they point the same way.
 * Exact for the given vectors.
 * @internal
 */
export function compareEdges(a: Vec2, b: Vec2): Integer {
  const halfA = edgeHalf(a);
  const halfB = edgeHalf(b);
  if (halfA !== halfB) return halfA - halfB;
  return -Math.sign(orientXY(0, 0, a.x, a.y, b.x, b.y));
}

function edgeHalf(edge: Vec2): Integer {
  return edge.y > 0 || (edge.y === 0 && edge.x > 0) ? 0 : 1;
}
