/** Chains oriented arrangement edges (result on their left) into closed loops. */
import type { Epsilon } from '../../../core/epsilon';
import type { Vec2 } from '../../../core/vec2';
import { TAU } from '../../../core/angle';
import { segmentCurvature, segmentTangent, type CurveSegment2 } from '../../../geometry/curves/arc-intersections';
import { Arc2, sagittaFromSweep, segmentOf } from '../../../geometry/primitives/arc2';
import { ArcPolygon2 } from '../../../geometry/regions/arc-polygon2';
import type { ArrangementEdge } from './arrangement';

/**
 * @internal Closed loops through `edges`, each used once. At a vertex with several ways on, the walk takes
 * the sharpest left turn (measured counter-clockwise from the way it came in), which keeps regions that
 * only touch at a point as separate loops. Loops come back as `ArcPolygon2`s, with collinear lines and
 * arcs on one circle merged; loops with no area are dropped.
 */
export function traceLoops(
  vertices: readonly Vec2[],
  edges: readonly ArrangementEdge[],
  epsilon: Epsilon,
): ArcPolygon2[] {
  const segments = edges.map((edge) => segmentOf(vertices[edge.from]!, vertices[edge.to]!, edge.sagitta, epsilon));
  const outgoing = new Map<number, number[]>();
  edges.forEach((edge, index) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), index]));
  const used = new Array<boolean>(edges.length).fill(false);
  const loops: ArcPolygon2[] = [];

  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const loop = [start];
    let current = start;
    let closed = true;
    while (edges[current]!.to !== edges[start]!.from) {
      const back = segmentTangent(segments[current]!, 1).negate();
      const candidates = (outgoing.get(edges[current]!.to) ?? []).filter((index) => !used[index]);
      if (candidates.length === 0) {
        closed = false;
        break;
      }
      const rank = (index: number) => {
        const out = segmentTangent(segments[index]!, 0);
        let angle = Math.atan2(back.crossProduct(out), back.dot(out));
        if (angle < 0) angle += TAU;
        // Leaving straight back the way it came: the curvature says which side of that direction it bends to.
        if (angle < 1e-9 || angle > TAU - 1e-9) angle = segmentCurvature(segments[index]!) >= 0 ? 0 : TAU;
        return angle;
      };
      const next = candidates.reduce((best, index) => {
        const difference = rank(index) - rank(best);
        if (Math.abs(difference) > 1e-9) return difference > 0 ? index : best;
        return segmentCurvature(segments[index]!) > segmentCurvature(segments[best]!) ? index : best;
      });
      used[next] = true;
      loop.push(next);
      current = next;
    }
    if (!closed) continue;
    const region = loopToRegion(
      loop.map((index) => segments[index]!),
      epsilon,
    );
    if (region && region.area() > epsilon.sq) loops.push(region);
  }
  return loops;
}

/** Merge neighbours on one line (same direction) or one circle (same turning direction). */
function mergeable(a: CurveSegment2, b: CurveSegment2, tolerance: number): boolean {
  if (a.type === 'Line2' && b.type === 'Line2') {
    const u = a.direction().unit();
    const v = b.direction().unit();
    return Math.abs(u.crossProduct(v)) <= tolerance && u.dot(v) > 0;
  }
  if (a.type === 'Arc2' && b.type === 'Arc2') {
    return (
      Math.sign(a.sagitta) === Math.sign(b.sagitta) &&
      a.centre().distance(b.centre()) <= 10 * tolerance &&
      Math.abs(a.radius() - b.radius()) <= 10 * tolerance &&
      Math.abs(a.sweep() + b.sweep()) < TAU - 1e-6
    );
  }
  return false;
}

function merge(a: CurveSegment2, b: CurveSegment2, epsilon: Epsilon): CurveSegment2 {
  if (a.type === 'Arc2' && b.type === 'Arc2') {
    return new Arc2(a.from, b.to, sagittaFromSweep(a.radius(), a.sweep() + b.sweep()), epsilon);
  }
  return segmentOf(a.from, b.to, 0, epsilon);
}

function loopToRegion(loop: CurveSegment2[], epsilon: Epsilon): ArcPolygon2 | null {
  const tolerance = Math.abs(epsilon.value);
  const minimum = () => (loop.some((segment) => segment.type === 'Arc2') ? 2 : 3);
  let merged = true;
  while (merged && loop.length > minimum()) {
    merged = false;
    for (let i = 0; i < loop.length && loop.length > minimum(); i++) {
      const j = (i + 1) % loop.length;
      if (!mergeable(loop[i]!, loop[j]!, tolerance)) continue;
      const combined = merge(loop[i]!, loop[j]!, epsilon);
      if (j === 0) {
        loop.splice(i, 1);
        loop[0] = combined;
      } else {
        loop.splice(i, 2, combined);
      }
      merged = true;
    }
  }
  try {
    return ArcPolygon2.fromSegments(loop, epsilon);
  } catch {
    return null; // a sliver that no longer closes or has a zero-length piece
  }
}
