/**
 * Constrained Delaunay triangulation (CDT) for planar geometries.
 *
 * Pipeline:
 * 1. Pack input geometry into Steiner points + undirected constraint edges
 *    (`ConstrainedDelaunay.collectSources`): endpoints, segment×segment crossings, and
 *    infinite-line hits become vertices; carriers are split into non-crossing
 *    constraint segments along each chain.
 * 2. Triangulate (`ConstrainedDelaunay.triangulate`, implemented in `./helpers/cdt`): Bowyer–Watson with walking point
 *    location, then hull edges and constraints forced in by flips and every other edge made locally
 *    Delaunay. All predicates are exact, so results do not depend on scale or offset.
 *
 * Prefer `ConstrainedDelaunay.fromGeometries` when starting from polygons / polylines / lines.
 * Use `ConstrainedDelaunay.triangulate` when points and constraint indices are already known
 * (e.g. Boolean2 after packing).
 */
import type { Length } from '../core/numbers';
import { assertNever } from '../core/assert';
import { Epsilon } from '../core/epsilon';
import { hash2scale } from '../hash/core';
import { mooreNeighborCellHashes } from '../hash/neighbors';
import { orient } from '../core/predicates';
import { Vec2 } from '../core/vec2';
import type { Polyline2 } from '../geometry/curves/polyline2';
import type { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { Line2 } from '../geometry/primitives/line2';
import { Intersection2 } from './intersection2';
import type { LineLike2IntersectionResult } from '../geometry/kinds';
import { Polygon2 } from '../geometry/regions/polygon2';
import { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { dedupVertices } from '../spatial/dedup-vertices';
import { emptyCdtStats, type CdtStats } from './helpers/cdt/mesh';
import { triangulateConstrained } from './helpers/cdt/triangulate';
import {
  constraintEdge,
  constraintEdgeEndpoints,
  type ConstraintEdge,
  type ConstraintEdgeInput,
} from './helpers/constraint-edge';

export type { CdtStats } from './helpers/cdt/mesh';
export type { ConstraintEdge, ConstraintEdgeInput } from './helpers/constraint-edge';

/** Geometry accepted by the packing / triangulation entry points. */
export type TriangulateGeometry = Polygon2 | Polyline2 | Line2 | InfiniteLine2 | Vec2;
export type TriangulateGeometries = readonly TriangulateGeometry[];

/** Points + constraint edges produced by packing input geometry. */
export type BuiltConstraintSources = {
  points: Vec2[];
  constraints: ConstraintEdge[];
  /** Same edges as `constraints`, expressed as concrete segments (debug / viz). */
  constraintSegments: { from: Vec2; to: Vec2 }[];
};

/** Slack-aware vertex index store used while packing geometry. */
type PointRegistry = {
  points: Vec2[];
  add: (point: Vec2) => number;
};

/** Hits collected along one constraint carrier (segment or infinite line). */
type HitChain = {
  hits: number[];
  origin: Vec2;
  direction: Vec2;
};

/** {@link ConstrainedDelaunay.triangulate} plus what it could not do and how much work it took. */
export type ConstrainedDelaunayReport = {
  mesh: TriMesh2;
  /** Constraint edges (in mesh vertex indices) that could not be inserted. */
  unresolved: [number, number][];
  stats: CdtStats;
};

/** Constrained Delaunay triangulation (see the module comment for the pipeline). */
export class ConstrainedDelaunay {
  private constructor() {}

  /**
   * Constrained Delaunay triangulation of `points`.
   * Constraint indices refer to the input `points` array (before dedup).
   *
   * Steps: dedup → split crossing constraints → triangulate with the constraints forced in.
   * Constraints that cannot be inserted are dropped; use {@link ConstrainedDelaunay.report} to see them.
   */
  static triangulate(
    points: readonly Vec2[],
    constraints: readonly ConstraintEdgeInput[] = [],
    slack: Epsilon = Epsilon.preferIn,
    gridSize?: Length,
  ): TriMesh2 {
    return ConstrainedDelaunay.report(points, constraints, slack, gridSize).mesh;
  }

  /** {@link ConstrainedDelaunay.triangulate}, plus the constraints it could not insert and operation counts. */
  static report(
    points: readonly Vec2[],
    constraints: readonly ConstraintEdgeInput[] = [],
    slack: Epsilon = Epsilon.preferIn,
    gridSize?: Length,
  ): ConstrainedDelaunayReport {
    const stats = emptyCdtStats();
    if (points.length === 0) return { mesh: TriMesh2.withoutCleanup([], []), unresolved: [], stats };

    const { vertices, remap } = dedupVertices([...points], slack, gridSize);
    const forced = splitAtCrossings(vertices, remapConstraints(constraints, remap, vertices.length));
    const { triangles, unresolved } = triangulateConstrained(vertices, forced.map(constraintEdgeEndpoints), stats);

    return {
      mesh: TriMesh2.withoutCleanup(
        vertices.map((v) => v.clone()),
        triangles,
      ),
      unresolved,
      stats,
    };
  }

  /** Pack input geometries, then triangulate the result. */
  static fromGeometries(geometries: TriangulateGeometries, slack: Epsilon = Epsilon.preferIn): TriMesh2 {
    const { points, constraints } = ConstrainedDelaunay.collectSources(geometries, slack);
    return ConstrainedDelaunay.triangulate(points, constraints, slack);
  }

  /**
   * Pack geometries into points + constraints:
   * seed chains → intersect carriers → emit split edges along each chain.
   * Finite segments contribute endpoints; infinite lines only contribute hits.
   */
  static collectSources(geometries: TriangulateGeometries, slack: Epsilon = Epsilon.preferIn): BuiltConstraintSources {
    const { segments, lines, steiner } = partitionGeometries(geometries);
    const registry = createPointRegistry(slack);
    const finite = segments.map((segment) =>
      seedChain(segment.from, segment.to.subtract(segment.from), registry, [segment.from, segment.to]),
    );
    const infinite = lines.map((line) => seedChain(line.through, line.direction, registry));
    const lineGeomHits = infinite.map(() => [] as number[]);

    for (const { point, i, j } of Intersection2.segmentCrossings(segments, slack)) {
      link(finite[i]!, finite[j]!, point, registry);
    }

    resolveInfiniteLineHits(segments, lines, finite, infinite, lineGeomHits, registry, slack);

    for (const point of steiner) registry.add(point);
    return emitConstraints([...finite, ...infinite], registry, slack);
  }
}

/** Split mixed geometry into finite segments, infinite lines, and free Steiner points. */
function partitionGeometries(geometries: TriangulateGeometries): {
  segments: Line2[];
  lines: InfiniteLine2[];
  steiner: Vec2[];
} {
  const segments: Line2[] = [];
  const lines: InfiniteLine2[] = [];
  const steiner: Vec2[] = [];

  for (const geometry of geometries) {
    switch (geometry.type) {
      case 'Polygon2':
      case 'Polyline2':
        segments.push(...geometry.segments());
        break;
      case 'Line2':
        segments.push(new Line2(geometry.from.clone(), geometry.to.clone()));
        break;
      case 'InfiniteLine2':
        lines.push(geometry);
        break;
      case 'Vec2':
        steiner.push(geometry);
        break;
      default:
        assertNever(geometry, 'ConstrainedDelaunay: unsupported geometry');
    }
  }

  return { segments, lines, steiner };
}

/** Deduping vertex store: points within `slack` reuse the same index (hashed, so adding is O(1)). */
function createPointRegistry(slack: Epsilon): PointRegistry {
  const points: Vec2[] = [];
  const radius = Math.abs(slack.value);
  const cells = new Map<number, number[]>();
  const cellOf = (point: Vec2) => hash2scale(point.x, point.y, radius);
  return {
    points,
    add(point: Vec2): number {
      const cell = cellOf(point);
      for (const hash of [cell, ...mooreNeighborCellHashes(cell)]) {
        for (const index of cells.get(hash) ?? []) {
          if (points[index]!.distance(point) <= radius) return index;
        }
      }
      points.push(point.clone());
      const bucket = cells.get(cell) ?? [];
      bucket.push(points.length - 1);
      cells.set(cell, bucket);
      return points.length - 1;
    },
  };
}

/**
 * Ordered hit list along a carrier ray (`origin` + `direction`).
 * Finite segments seed both endpoints; infinite lines start empty.
 */
function seedChain(origin: Vec2, direction: Vec2, registry: PointRegistry, endpoints: readonly Vec2[] = []): HitChain {
  return {
    hits: endpoints.map((point) => registry.add(point)),
    origin,
    direction,
  };
}

/** Register an intersection point and attach it to both participating chains. */
function link(a: HitChain, b: HitChain, point: Vec2, registry: PointRegistry): number {
  const id = registry.add(point);
  a.hits.push(id);
  b.hits.push(id);
  return id;
}

/** Narrow intersection results to a point (ignore overlaps / null). */
function asPoint(result: LineLike2IntersectionResult): Vec2 | null {
  return result?.type === 'Vec2' ? result : null;
}

/**
 * Infinite lines only contribute vertices where they hit other geometry.
 * 1) segment × line → geometry hits (also recorded for span checks)
 * 2) line × line, only inside each line's geometry-hit span
 */
function resolveInfiniteLineHits(
  segments: readonly Line2[],
  lines: readonly InfiniteLine2[],
  finite: HitChain[],
  infinite: HitChain[],
  lineGeomHits: number[][],
  registry: PointRegistry,
  slack: Epsilon,
): void {
  for (let i = 0; i < segments.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      const hit = asPoint(Intersection2.lines(segments[i]!, lines[j]!));
      if (!hit) continue;
      lineGeomHits[j]!.push(link(finite[i]!, infinite[j]!, hit, registry));
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lineGeomHits[i]!.length === 0) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lineGeomHits[j]!.length === 0) continue;
      const hit = asPoint(Intersection2.lines(lines[i]!, lines[j]!));
      if (!hit) continue;
      if (!withinHitSpan(lines[i]!, hit, lineGeomHits[i]!, registry.points, slack)) continue;
      if (!withinHitSpan(lines[j]!, hit, lineGeomHits[j]!, registry.points, slack)) continue;
      link(infinite[i]!, infinite[j]!, hit, registry);
    }
  }
}

/**
 * Sort each chain along its carrier and emit consecutive non-degenerate edges
 * as undirected constraints.
 */
function emitConstraints(chains: readonly HitChain[], registry: PointRegistry, slack: Epsilon): BuiltConstraintSources {
  const constraints: ConstraintEdge[] = [];
  const constraintSegments: { from: Vec2; to: Vec2 }[] = [];
  const seen = new Set<number>();

  for (const chain of chains) {
    const ids = [...new Set(chain.hits)];
    if (ids.length < 2) continue;

    ids.sort(
      (a, b) =>
        registry.points[a]!.subtract(chain.origin).dot(chain.direction) -
        registry.points[b]!.subtract(chain.origin).dot(chain.direction),
    );

    for (let i = 0; i < ids.length - 1; i++) {
      const u = ids[i]!;
      const v = ids[i + 1]!;
      if (u === v || registry.points[u]!.distance(registry.points[v]!) <= slack.value) continue;
      const key = constraintEdge(u, v);
      if (seen.has(key)) continue;
      seen.add(key);
      constraints.push(key);
      constraintSegments.push({ from: registry.points[u]!.clone(), to: registry.points[v]!.clone() });
    }
  }

  return { points: registry.points, constraints, constraintSegments };
}

/** True when `point` lies between the extreme geometry hits on `line` (with slack). */
function withinHitSpan(
  line: InfiniteLine2,
  point: Vec2,
  hitIndices: readonly number[],
  points: readonly Vec2[],
  slack: Epsilon,
): boolean {
  if (hitIndices.length === 0) return false;
  const dirLen = line.direction.length();
  if (dirLen < Epsilon.value) return false;

  const ts = hitIndices.map((index) => line.closestParameterForPoint(points[index]!));
  const t = line.closestParameterForPoint(point);
  const pad = slack.value / dirLen;
  return t >= Math.min(...ts) - pad && t <= Math.max(...ts) + pad;
}

/** Map constraint endpoints through the dedup remap; drop collapsed / duplicate edges. */
function remapConstraints(constraints: readonly ConstraintEdgeInput[], remap: number[], n: number): ConstraintEdge[] {
  const seen = new Set<number>();
  const out: ConstraintEdge[] = [];
  for (const input of constraints) {
    const [ia, ib] = typeof input === 'number' ? constraintEdgeEndpoints(input) : input;
    if (ia < 0 || ib < 0 || ia >= remap.length || ib >= remap.length) throw new Error('Constraint index out of range');
    const a = remap[ia]!;
    const b = remap[ib]!;
    if (a === b) continue;
    const key = constraintEdge(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Insert vertices at proper constraint crossings, then rewrite each constraint
 * as consecutive collinear sub-edges so the mesh never has crossing forced edges.
 */
function splitAtCrossings(vertices: Vec2[], constraints: readonly ConstraintEdge[]): ConstraintEdge[] {
  for (let i = 0; i < constraints.length; i++) {
    const [a, b] = constraintEdgeEndpoints(constraints[i]!);
    for (let j = i + 1; j < constraints.length; j++) {
      const [c, d] = constraintEdgeEndpoints(constraints[j]!);
      if (a === c || a === d || b === c || b === d) continue;
      if (!crosses(vertices[a]!, vertices[b]!, vertices[c]!, vertices[d]!)) continue;
      const hit = asPoint(
        Intersection2.lines(new Line2(vertices[a]!, vertices[b]!), new Line2(vertices[c]!, vertices[d]!)),
      );
      if (hit && !vertices.some((v) => v.distance(hit) < Epsilon.value)) vertices.push(hit.clone());
    }
  }

  const seen = new Set<number>();
  const out: ConstraintEdge[] = [];
  for (const edge of constraints) {
    const along = onSegment(vertices, ...constraintEdgeEndpoints(edge));
    for (let i = 0; i < along.length - 1; i++) {
      const key = constraintEdge(along[i]!, along[i + 1]!);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Proper (non-endpoint, non-collinear) segment intersection, decided exactly. */
function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

/** Vertex indices lying on segment `a-b` (within `Epsilon.value` of it), ordered from `a` to `b`. */
function onSegment(vertices: readonly Vec2[], a: number, b: number): number[] {
  const pa = vertices[a]!;
  const pb = vertices[b]!;
  const ab = pb.subtract(pa);
  const lenSq = ab.dot(ab);
  if (lenSq < Epsilon.sq) return [a];
  const along = [
    { i: a, t: 0 },
    { i: b, t: 1 },
  ];
  // Parameter tolerance is a length along the segment, so it holds at any segment length.
  const tTolerance = Epsilon.parameter(Math.sqrt(lenSq));
  for (let i = 0; i < vertices.length; i++) {
    if (i === a || i === b) continue;
    const ap = vertices[i]!.subtract(pa);
    if (Math.abs(ap.crossProduct(ab)) > Epsilon.value * Math.sqrt(lenSq)) continue;
    const t = ap.dot(ab) / lenSq;
    if (t > tTolerance && t < 1 - tTolerance) along.push({ i, t });
  }
  along.sort((x, y) => x.t - y.t);
  return along.map((e) => e.i);
}
