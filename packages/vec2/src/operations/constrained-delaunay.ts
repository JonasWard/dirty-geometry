/**
 * Constrained Delaunay triangulation (CDT) for planar geometries.
 *
 * 1. Packing (`./helpers/cdt/sources`): points within `slack` are merged; constraints are split where they
 *    cross or touch each other, and a Steiner point goes in at each crossing.
 * 2. Triangulation (`./helpers/cdt/triangulate`): delaunator's sweep-hull, then the constraints are forced
 *    in with Sloan's flips. All predicates are exact, so results do not depend on scale or offset.
 *
 * Use `ConstrainedDelaunay.fromGeometries` for polygons, polylines and lines, and
 * `ConstrainedDelaunay.triangulate` when points and constraint indices are known. Constraints are
 * `constraintEdge` keys (hash2 of the two indices) internally.
 */
import { Epsilon } from '../core/epsilon';
import type { Vec2 } from '../core/vec2';
import { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { assertCdtVertexCount, type ConstraintEdge, type ConstraintEdgeInput } from './helpers/constraint-edge';
import {
  collectConstraintSources,
  packIndexed,
  type BuiltConstraintSources,
  type TriangulateGeometries,
} from './helpers/cdt/sources';
import { emptyCdtStats, type CdtStats } from './helpers/cdt/stats';
import { triangulateCorners } from './helpers/cdt/triangulate';

export type { CdtStats } from './helpers/cdt/stats';
export type { BuiltConstraintSources, TriangulateGeometries, TriangulateGeometry } from './helpers/cdt/sources';
export type { ConstraintEdge, ConstraintEdgeInput } from './helpers/constraint-edge';

/** {@link ConstrainedDelaunay.triangulate} plus what it could not do and how much work it took. */
export type ConstrainedDelaunayReport = {
  mesh: TriMesh2;
  /** Constraints (as `constraintEdge` keys over the mesh vertices) that could not be inserted. */
  unresolved: ConstraintEdge[];
  stats: CdtStats;
};

/** Constrained Delaunay triangulation (see the module comment for the pipeline). */
export class ConstrainedDelaunay {
  private constructor() {}

  /**
   * Constrained Delaunay triangulation of `points`. Constraint indices refer to the input `points` array.
   * Constraints that cannot be inserted are dropped; use {@link ConstrainedDelaunay.report} to see them.
   * At most 2²⁶ points.
   */
  static triangulate(
    points: readonly Vec2[],
    constraints: readonly ConstraintEdgeInput[] = [],
    slack: Epsilon = Epsilon.preferIn,
  ): TriMesh2 {
    return ConstrainedDelaunay.report(points, constraints, slack).mesh;
  }

  /** {@link ConstrainedDelaunay.triangulate}, plus the constraints it could not insert and operation counts. */
  static report(
    points: readonly Vec2[],
    constraints: readonly ConstraintEdgeInput[] = [],
    slack: Epsilon = Epsilon.preferIn,
  ): ConstrainedDelaunayReport {
    slack.isPositive('operations - ConstrainedDelaunay', 'report');
    assertCdtVertexCount(points.length);
    return triangulateSources(packIndexed(points, constraints, slack), slack);
  }

  /** Pack input geometries, then triangulate the result. */
  static fromGeometries(geometries: TriangulateGeometries, slack: Epsilon = Epsilon.preferIn): TriMesh2 {
    slack.isPositive('operations - ConstrainedDelaunay', 'fromGeometries');
    return triangulateSources(collectConstraintSources(geometries, slack), slack).mesh;
  }

  /**
   * Pack geometries into points + constraints:
   * seed chains → intersect carriers → emit split edges along each chain.
   * Finite segments contribute endpoints; infinite lines only contribute hits.
   */
  static collectSources(geometries: TriangulateGeometries, slack: Epsilon = Epsilon.preferIn): BuiltConstraintSources {
    slack.isPositive('operations - ConstrainedDelaunay', 'collectSources');
    return collectConstraintSources(geometries, slack);
  }
}

/** Triangulate packed sources (points are distinct within slack, constraints are non-crossing). */
function triangulateSources(
  { points, constraints }: BuiltConstraintSources,
  slack: Epsilon,
): ConstrainedDelaunayReport {
  const stats = emptyCdtStats();
  const { corners, unresolved } = triangulateCorners(points, constraints, stats, slack.value);
  return { mesh: TriMesh2.fromCorners(points, corners), unresolved, stats };
}
