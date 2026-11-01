/**
 * The planar arrangement of straight and circular segments: every segment split where it meets another,
 * end points snapped to one vertex set, and shared pieces kept once.
 */
import type { Epsilon } from '../../../core/epsilon';
import type { Vec2 } from '../../../core/vec2';
import { segmentIntersections, type CurveSegment2 } from '../../../geometry/curves/arc-intersections';
import { sagittaFromSweep } from '../../../geometry/primitives/arc2';

/**
 * A piece from vertex `from` to vertex `to`, bulging `sagitta` to its left (0: straight). It is the part
 * `[t0, t1]` of `source`, the input segment it was cut from: snapping can straighten a short arc piece, so
 * questions about which side of the boundary a point is on are asked of `source`.
 */
export type ArrangementEdge = {
  from: number;
  to: number;
  sagitta: number;
  source: CurveSegment2;
  t0: number;
  t1: number;
};

export type Arrangement = { vertices: Vec2[]; edges: ArrangementEdge[] };

/** Points within `tolerance` of each other share one vertex (looked up in a grid of that cell size). */
class VertexSnap {
  readonly vertices: Vec2[] = [];
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly tolerance: number) {}

  /** Cell key; distinct cells may share one, which only adds candidates (distances are still checked). */
  private key(i: number, j: number): number {
    return i * 67108864 + j;
  }

  index(point: Vec2): number {
    const i = Math.floor(point.x / this.tolerance);
    const j = Math.floor(point.y / this.tolerance);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const index of this.cells.get(this.key(i + di, j + dj)) ?? []) {
          if (this.vertices[index]!.distance(point) <= this.tolerance) return index;
        }
      }
    }
    const index = this.vertices.push(point) - 1;
    const key = this.key(i, j);
    this.cells.set(key, [...(this.cells.get(key) ?? []), index]);
    return index;
  }
}

/** @internal Split `segments` at all their intersections and merge the pieces they share. */
export function buildArrangement(segments: readonly CurveSegment2[], slack: Epsilon): Arrangement {
  const tolerance = Math.abs(slack.value);
  const boxes = segments.map((segment) => segment.aabb2());
  const cuts: { t: number; point: Vec2 }[][] = segments.map((segment) => [
    { t: 0, point: segment.from },
    { t: 1, point: segment.to },
  ]);

  // Sweep along x: each segment meets only the ones whose x-range starts before its own ends.
  const order = segments.map((_, i) => i).sort((p, q) => boxes[p]!.x.min - boxes[q]!.x.min);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi]!;
    const a = boxes[i]!;
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj]!;
      const b = boxes[j]!;
      if (b.x.min > a.x.max + tolerance) break;
      if (a.y.max + tolerance < b.y.min || b.y.max + tolerance < a.y.min) continue;
      for (const point of segmentIntersections(segments[i]!, segments[j]!, slack)) {
        cuts[i]!.push({ t: segments[i]!.closestParameterForPoint(point), point });
        cuts[j]!.push({ t: segments[j]!.closestParameterForPoint(point), point });
      }
    }
  }

  const snap = new VertexSnap(tolerance);
  const edges: ArrangementEdge[] = [];
  const seen = new Map<number, number[]>();
  const add = (from: number, to: number, sagitta: number, source: CurveSegment2, t0: number, t1: number) => {
    if (from === to) return;
    const s = Math.abs(sagitta) <= tolerance ? 0 : sagitta;
    // One key per unordered vertex pair; the sagitta is stored as seen walking from the lower index.
    const key = from < to ? from * 67108864 + to : to * 67108864 + from; // exact below 2^26 vertices
    const canonical = from < to ? s : -s;
    const known = seen.get(key) ?? [];
    if (known.some((other) => Math.abs(other - canonical) <= tolerance)) return;
    seen.set(key, [...known, canonical]);
    edges.push({ from, to, sagitta: s, source, t0, t1 });
  };

  segments.forEach((segment, i) => {
    const points = cuts[i]!.sort((p, q) => p.t - q.t);
    let previous = { t: 0, index: snap.index(segment.from) };
    for (const { t, point } of points.slice(1)) {
      const index = t >= 1 ? snap.index(segment.to) : snap.index(point);
      if (index === previous.index) continue;
      const sagitta =
        segment.type === 'Arc2' ? sagittaFromSweep(segment.radius(), (t - previous.t) * segment.sweep()) : 0;
      add(previous.index, index, sagitta, segment, previous.t, t);
      previous = { t, index };
    }
  });

  return { vertices: snap.vertices, edges };
}
