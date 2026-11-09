import type { Vec2 } from '../../../core/vec2';
import { compareEdges, withoutStraightVertices } from './convex-loop';

/**
 * Minkowski sum of two loops from `convexLoop`, by merging their edges in angle order: O(n + m). Edges pointing
 * the same way are taken together, so the result has no straight vertices.
 * @internal
 */
export function mergeConvex(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const edgesA = edgesOf(a);
  const edgesB = edgesOf(b);
  const result: Vec2[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    result.push(a[i % a.length]!.add(b[j % b.length]!));
    const order = i === a.length ? 1 : j === b.length ? -1 : compareEdges(edgesA[i]!, edgesB[j]!);
    if (order <= 0) i++;
    if (order >= 0) j++;
  }
  // Rounding in the sums can leave a vertex that is not a strict left turn.
  return withoutStraightVertices(result);
}

function edgesOf(loop: readonly Vec2[]): Vec2[] {
  return loop.map((v, i) => loop[(i + 1) % loop.length]!.subtract(v));
}
