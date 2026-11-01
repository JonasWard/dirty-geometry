/**
 * Exact boolean of regions bounded by straight and circular segments. The boundaries are split where they
 * meet (an arrangement); a piece of boundary belongs to the result when the result is inside on one side
 * of it and outside on the other. Kept pieces are oriented with the result on their left and traced into
 * loops: outer loops counter-clockwise, holes clockwise.
 */
import type { Epsilon } from '../../../core/epsilon';
import type { Vec2 } from '../../../core/vec2';
import type { CurveSegment2 } from '../../../geometry/curves/arc-intersections';
import type { ArcPolygon2 } from '../../../geometry/regions/arc-polygon2';
import { buildArrangement, type ArrangementEdge } from './arrangement';
import { traceLoops } from './trace';

/**
 * @internal The region where `inside` holds, bounded by pieces of `boundaries`. `inside` must be constant
 * between the boundaries (as winding numbers and half-plane tests are).
 */
export function exactCurveBoolean(
  boundaries: readonly CurveSegment2[],
  inside: (point: Vec2) => boolean,
  slack: Epsilon,
): ArcPolygon2[] {
  const { vertices, edges } = buildArrangement(boundaries, slack);
  const tolerance = Math.abs(slack.value);
  const kept: ArrangementEdge[] = [];

  for (const edge of edges) {
    // Probe either side of the piece's middle on its source curve, which the piece follows within tolerance.
    const { source } = edge;
    const t = (edge.t0 + edge.t1) / 2;
    const middle = source.evaluate(t);
    const normal = source.type === 'Arc2' ? source.normal(t) : source.direction().unit().perpendicular();
    // Crossings are split and snapped at `tolerance`, so other boundaries are much further away than this.
    const reach = Math.min(
      tolerance / 64,
      (source.length() * (edge.t1 - edge.t0)) / 4,
      source.type === 'Arc2' ? source.radius() / 4 : Infinity,
    );
    const left = inside(middle.add(normal.scale(reach)));
    const right = inside(middle.subtract(normal.scale(reach)));
    if (left === right) continue;
    kept.push(left ? edge : { ...edge, from: edge.to, to: edge.from, sagitta: -edge.sagitta });
  }

  return traceLoops(vertices, kept, slack);
}
