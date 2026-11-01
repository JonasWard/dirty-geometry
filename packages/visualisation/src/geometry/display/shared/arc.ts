import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { arcSteps, type Arc2 } from '@dirty-geometry/vec2/geometry/primitives/arc2';
import type { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';

/** At most 2° per sample, so circles look round at ordinary zoom whatever their size. */
const MAX_STEP = (2 * Math.PI) / 180;
/** Short pieces of a large circle still get a few samples. */
const MIN_STEPS = 4;
/**
 * Largest gap between an arc and its samples, in display-frame units. Lab scenes zoom to at most 2000 px per
 * frame unit (`ScenarioGridVisualisation`), so this keeps samples within 0.4 px of the arc even there.
 */
const FRAME_CHORD_TOLERANCE = 2e-4;

/** The world-space chord tolerance for a scene drawn through `fit` (world → display frame). */
export function displayChordTolerance(fit: (point: Vec2) => Vec2): number {
  const scale = fit(new Vec2(1, 0)).distance(fit(new Vec2(0, 0)));
  return scale > 0 ? FRAME_CHORD_TOLERANCE / scale : Infinity;
}

/**
 * Display samples along a chain of straight and circular segments; closed chains repeat the first point.
 * Each arc gets at most 2° per step and, given `chordTolerance` (world units), enough steps to stay within
 * it: large, gentle arcs then get the extra samples a deep zoom needs, small ones do not.
 */
export function arcChainDisplayPoints(
  segments: readonly (Line2 | Arc2)[],
  closed: boolean,
  chordTolerance = Infinity,
): Vec2[] {
  const points: Vec2[] = [];
  for (const segment of segments) {
    points.push(segment.from.clone());
    if (segment.type === 'Arc2') {
      const sweep = Math.abs(segment.sweep());
      const forTolerance = Number.isFinite(chordTolerance) ? arcSteps(segment.radius(), sweep, chordTolerance) : 0;
      const steps = Math.max(MIN_STEPS, Math.ceil(sweep / MAX_STEP), forTolerance);
      for (let i = 1; i < steps; i++) points.push(segment.evaluate(i / steps));
    }
  }
  const last = segments[segments.length - 1];
  if (last) points.push(closed ? segments[0]!.from.clone() : last.to.clone());
  return points;
}
