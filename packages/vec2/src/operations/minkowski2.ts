import type { Vec2 } from '../core/vec2';
import { Polygon2 } from '../geometry/regions/polygon2';
import { convexLoop } from './helpers/minkowski/convex-loop';
import { mergeConvex } from './helpers/minkowski/edge-merge';

/**
 * Minkowski sums: every point of one shape plus every point of the other. Shapes are given as boundary loops,
 * as for `Boolean2`: counter-clockwise outer loops, clockwise holes.
 */
export class Minkowski2 {
  private constructor() {}

  /** Sum of two convex polygons (either orientation), counter-clockwise. Exact edge order; O(n + m). */
  static convexSum(a: Polygon2, b: Polygon2): Polygon2 {
    return new Polygon2(mergeConvex(convexLoop(a), convexLoop(b)));
  }

  /** Convex hull of every pairwise sum `a[i] + b[j]`; `null` when the sums lie on one line. O(n·m). */
  static sumPoints(a: readonly Vec2[], b: readonly Vec2[]): Polygon2 | null {
    return Polygon2.convexHull(a.flatMap((p) => b.map((q) => p.add(q))));
  }
}
