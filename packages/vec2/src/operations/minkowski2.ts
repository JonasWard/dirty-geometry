import { Epsilon } from '../core/epsilon';
import type { Index, Length } from '../core/numbers';
import type { Vec2 } from '../core/vec2';
import { ArcPolygon2 } from '../geometry/regions/arc-polygon2';
import { Polygon2 } from '../geometry/regions/polygon2';
import { Boolean2, type Boolean2Result } from './boolean2';
import { convexLoop } from './helpers/minkowski/convex-loop';
import { mergeConvex } from './helpers/minkowski/edge-merge';
import { convexPieces } from './helpers/minkowski/convex-pieces';
import { capsule, roundedConvex } from './helpers/minkowski/rounded';

export type Minkowski2Options = {
  /** Tolerance for merging points and dropping tiny pieces (default `Epsilon.preferIn`). */
  slack?: Epsilon;
  /** Throw when the sum would need more convex piece pairs than this (default 20 000). */
  maxPieces?: Index;
};

const DEFAULT_MAX_PIECES = 20_000;

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

  /**
   * A convex polygon (either orientation) grown by a disc of `radius`: edges moved outward, corners rounded by
   * arcs. Counter-clockwise.
   */
  static convexSumDisc(polygon: Polygon2, radius: Length, options: Minkowski2Options = {}): ArcPolygon2 {
    const slack = options.slack ?? Epsilon.preferIn;
    if (radius < 0) throw new Error('Minkowski2: the radius must not be negative');
    const loop = convexLoop(polygon);
    if (radius === 0) return ArcPolygon2.fromPolygon(new Polygon2(loop), slack);
    return roundedConvex(loop, radius, slack);
  }

  /**
   * `shape` grown by a disc of `radius` (rounded offset), with exact arcs in `regions`. A single convex loop is
   * built directly; anything else is the union of the shape and a capsule around every edge, holes included.
   */
  static sumDisc(shape: readonly Polygon2[], radius: Length, options: Minkowski2Options = {}): Boolean2Result {
    const slack = options.slack ?? Epsilon.preferIn;
    if (radius < 0) throw new Error('Minkowski2: the radius must not be negative');
    if (shape.length === 0) return { polygons: [], regions: [] };
    if (radius === 0) return Boolean2.union(shape, { slack });
    if (shape.length === 1 && shape[0]!.isConvex()) {
      return { polygons: [], regions: [Minkowski2.convexSumDisc(shape[0]!, radius, options)] };
    }
    const capsules = shape.flatMap((polygon) =>
      polygon.vertices.flatMap(
        (v, i) => capsule(v, polygon.vertices[(i + 1) % polygon.vertices.length]!, radius, slack) ?? [],
      ),
    );
    return Boolean2.union([...shape, ...capsules], { slack, arcs: { mode: 'exact' } });
  }

  /**
   * Sum of two shapes of any form, holes included. Each shape is split into convex pieces (triangles merged
   * while convex), every pair of pieces is summed with {@link convexSum}, and the sums are united.
   * Costs |pieces of a| · |pieces of b| sums and their union; throws past `maxPieces` pairs.
   */
  static sum(a: readonly Polygon2[], b: readonly Polygon2[], options: Minkowski2Options = {}): Boolean2Result {
    const slack = options.slack ?? Epsilon.preferIn;
    const piecesA = convexPieces(a, slack);
    const piecesB = convexPieces(b, slack);
    const pairs = piecesA.length * piecesB.length;
    if (pairs === 0) return { polygons: [] };
    if (pairs > (options.maxPieces ?? DEFAULT_MAX_PIECES)) {
      throw new Error(`Minkowski2: ${pairs} piece pairs exceed maxPieces`);
    }
    if (pairs === 1) return { polygons: [Minkowski2.convexSum(piecesA[0]!, piecesB[0]!)] };
    const sums = piecesA.flatMap((p) => piecesB.map((q) => Minkowski2.convexSum(p, q)));
    return Boolean2.union(sums, { slack });
  }
}
