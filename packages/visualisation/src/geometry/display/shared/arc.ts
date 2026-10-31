import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Arc2 } from '@dirty-geometry/vec2/geometry/primitives/arc2';
import type { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';

/** Samples per full turn, as for circles (`circleDisplayPoints` uses 24 for a whole circle). */
const STEPS_PER_TURN = 48;

/** Display samples along a chain of straight and circular segments; closed chains repeat the first point. */
export function arcChainDisplayPoints(segments: readonly (Line2 | Arc2)[], closed: boolean): Vec2[] {
  const points: Vec2[] = [];
  for (const segment of segments) {
    points.push(segment.from.clone());
    if (segment.type === 'Arc2') {
      const steps = Math.max(2, Math.ceil((Math.abs(segment.sweep()) / (2 * Math.PI)) * STEPS_PER_TURN));
      for (let i = 1; i < steps; i++) points.push(segment.evaluate(i / steps));
    }
  }
  const last = segments[segments.length - 1];
  if (last) points.push(closed ? segments[0]!.from.clone() : last.to.clone());
  return points;
}
