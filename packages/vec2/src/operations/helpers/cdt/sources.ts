/**
 * Packing input geometry into constrained-Delaunay sources: points plus undirected constraint edges.
 *
 * Every carrier (finite segment or infinite line) becomes a chain of hits: its endpoints, its crossings
 * with other carriers, and (for infinite lines) only the hits with finite geometry and the line
 * crossings between those. Each chain is sorted along its carrier and emitted as consecutive edges, so
 * constraints never cross. Points within `slack` share one index.
 */
import { assertNever } from '../../../core/assert';
import { Epsilon } from '../../../core/epsilon';
import type { Vec2 } from '../../../core/vec2';
import type { Polyline2 } from '../../../geometry/curves/polyline2';
import type { LineLike2IntersectionResult } from '../../../geometry/kinds';
import type { InfiniteLine2 } from '../../../geometry/primitives/infinite-line2';
import { Line2 } from '../../../geometry/primitives/line2';
import type { Polygon2 } from '../../../geometry/regions/polygon2';
import { hash2, wrapHashIndex } from '../../../hash/core';
import { Intersection2 } from '../../intersection2';
import {
  constraintEdge,
  constraintEdgeEndpoints,
  type ConstraintEdge,
  type ConstraintEdgeInput,
} from '../constraint-edge';

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

/** Hits collected along one carrier `origin + t · direction`. */
type HitChain = {
  hits: number[];
  origin: Vec2;
  direction: Vec2;
  /** Infinite lines only: parameter range covered by hits with finite geometry. */
  span?: { min: number; max: number };
};

/**
 * Points and non-crossing constraints for geometry input. Steiner points come first in the point list.
 * @internal
 */
export function collectConstraintSources(geometries: TriangulateGeometries, slack: Epsilon): BuiltConstraintSources {
  const { segments, lines, steiner } = partitionGeometries(geometries);
  const registry = new PointRegistry(Math.abs(slack.value));
  for (const point of steiner) registry.add(point);
  return packSources(registry, segments, lines, slack);
}

/**
 * Points and non-crossing constraints for index input: `points` keeps its order (merged within slack),
 * constraints are index pairs (or `constraintEdge` keys) into it.
 * @internal
 */
export function packIndexed(
  points: readonly Vec2[],
  constraints: readonly ConstraintEdgeInput[],
  slack: Epsilon,
): BuiltConstraintSources {
  const registry = new PointRegistry(Math.abs(slack.value));
  const ids = points.map((point) => registry.add(point));
  const segments: Line2[] = [];
  for (const input of constraints) {
    const [ia, ib] = typeof input === 'number' ? constraintEdgeEndpoints(input) : input;
    if (ia < 0 || ib < 0 || ia >= points.length || ib >= points.length)
      throw new Error('Constraint index out of range');
    if (ids[ia] !== ids[ib]) segments.push(new Line2(points[ia]!, points[ib]!));
  }
  return packSources(registry, segments, [], slack);
}

/** Chains along every carrier, intersected, emitted as non-crossing constraints. */
function packSources(
  registry: PointRegistry,
  segments: readonly Line2[],
  lines: readonly InfiniteLine2[],
  slack: Epsilon,
): BuiltConstraintSources {
  const finite = segments.map((segment) => ({
    hits: [registry.add(segment.from), registry.add(segment.to)],
    origin: segment.from,
    direction: segment.to.subtract(segment.from),
  }));
  const infinite: HitChain[] = lines.map((line) => ({ hits: [], origin: line.through, direction: line.direction }));

  for (const { point, i, j } of Intersection2.segmentCrossings(segments, slack)) {
    link(finite[i]!, finite[j]!, registry.add(point));
  }
  addInfiniteLineHits(segments, lines, finite, infinite, registry, slack);
  return emitConstraints([...finite, ...infinite], registry.points, slack);
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

/**
 * Deduping point store: a point within `radius` of an earlier one reuses its index. Points are bucketed in
 * cells twice the radius wide, so a query only visits the cells its radius-box touches.
 */
class PointRegistry {
  readonly points: Vec2[] = [];
  private readonly cells = new Map<number, number[]>();
  private readonly size: number;

  constructor(private readonly radius: number) {
    this.size = 2 * radius;
  }

  private key(i: number, j: number): number {
    return hash2(wrapHashIndex(i), wrapHashIndex(j));
  }

  add(point: Vec2): number {
    const { radius, size } = this;
    for (let i = Math.floor((point.x - radius) / size); i <= Math.floor((point.x + radius) / size); i++) {
      for (let j = Math.floor((point.y - radius) / size); j <= Math.floor((point.y + radius) / size); j++) {
        for (const index of this.cells.get(this.key(i, j)) ?? []) {
          if (this.points[index]!.distance(point) <= radius) return index;
        }
      }
    }
    const index = this.points.push(point.clone()) - 1;
    const cell = this.key(Math.floor(point.x / size), Math.floor(point.y / size));
    const bucket = this.cells.get(cell);
    if (bucket) bucket.push(index);
    else this.cells.set(cell, [index]);
    return index;
  }
}

/** Attach point `id` to both chains. */
function link(a: HitChain, b: HitChain, id: number): void {
  a.hits.push(id);
  b.hits.push(id);
}

/** Narrow intersection results to a point (ignore overlaps / null). */
function asPoint(result: LineLike2IntersectionResult): Vec2 | null {
  return result?.type === 'Vec2' ? result : null;
}

/**
 * Infinite lines only contribute vertices where they hit other geometry:
 * 1. segment × line hits, which also set each line's span;
 * 2. line × line crossings, only inside both lines' spans.
 */
function addInfiniteLineHits(
  segments: readonly Line2[],
  lines: readonly InfiniteLine2[],
  finite: HitChain[],
  infinite: HitChain[],
  registry: PointRegistry,
  slack: Epsilon,
): void {
  for (let i = 0; i < segments.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      const hit = asPoint(Intersection2.lines(segments[i]!, lines[j]!));
      if (!hit) continue;
      const id = registry.add(hit);
      link(finite[i]!, infinite[j]!, id);
      const t = lines[j]!.closestParameterForPoint(registry.points[id]!);
      const span = (infinite[j]!.span ??= { min: t, max: t });
      span.min = Math.min(span.min, t);
      span.max = Math.max(span.max, t);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (!infinite[i]!.span) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (!infinite[j]!.span) continue;
      const hit = asPoint(Intersection2.lines(lines[i]!, lines[j]!));
      if (!hit) continue;
      if (!withinSpan(lines[i]!, infinite[i]!.span!, hit, slack)) continue;
      if (!withinSpan(lines[j]!, infinite[j]!.span!, hit, slack)) continue;
      link(infinite[i]!, infinite[j]!, registry.add(hit));
    }
  }
}

/** True when `point` lies within `span` on `line`, padded by `slack`. */
function withinSpan(line: InfiniteLine2, span: { min: number; max: number }, point: Vec2, slack: Epsilon): boolean {
  const length = line.direction.length();
  if (length < Epsilon.value) return false;
  const t = line.closestParameterForPoint(point);
  const pad = slack.value / length;
  return t >= span.min - pad && t <= span.max + pad;
}

/** Sort each chain along its carrier and emit consecutive, non-degenerate edges as constraints. */
function emitConstraints(chains: readonly HitChain[], points: Vec2[], slack: Epsilon): BuiltConstraintSources {
  const constraints: ConstraintEdge[] = [];
  const constraintSegments: { from: Vec2; to: Vec2 }[] = [];
  const seen = new Set<ConstraintEdge>();

  for (const chain of chains) {
    const along = [...new Set(chain.hits)].map((id) => ({
      id,
      t: points[id]!.subtract(chain.origin).dot(chain.direction),
    }));
    if (along.length < 2) continue;
    along.sort((a, b) => a.t - b.t);
    for (let i = 0; i + 1 < along.length; i++) {
      const u = along[i]!.id;
      const v = along[i + 1]!.id;
      if (points[u]!.distance(points[v]!) <= slack.value) continue;
      const key = constraintEdge(u, v);
      if (seen.has(key)) continue;
      seen.add(key);
      constraints.push(key);
      constraintSegments.push({ from: points[u]!.clone(), to: points[v]!.clone() });
    }
  }
  return { points, constraints, constraintSegments };
}
