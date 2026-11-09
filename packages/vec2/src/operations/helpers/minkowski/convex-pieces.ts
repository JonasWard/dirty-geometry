import type { Epsilon } from '../../../core/epsilon';
import type { Polygon2 } from '../../../geometry/regions/polygon2';
import { ConvexDecomposition2 } from '../../convex-decomposition2';

/**
 * Convex pieces covering the region of `loops`, for a Minkowski sum. Overlapping pieces are fine there (a sum
 * over a union is the union of the sums), so loops that are all convex and counter-clockwise are used as they
 * are; anything else goes through `ConvexDecomposition2.decompose`.
 * @internal
 */
export function convexPieces(loops: readonly Polygon2[], slack: Epsilon): Polygon2[] {
  if (loops.every((loop) => loop.signedArea() > 0 && loop.isConvex())) return [...loops];
  return ConvexDecomposition2.decompose(loops, slack);
}
