/**
 * Intersections between straight and circular segments and their supporting lines and circles.
 * Shared by arc-polyline offsets (joining offset segments), containment and overlap tests.
 */
import { Epsilon } from '../../core/epsilon';
import { Vec2 } from '../../core/vec2';
import { Arc2 } from '../primitives/arc2';
import { Line2 } from '../primitives/line2';

/** A straight or circular segment. */
export type CurveSegment2 = Line2 | Arc2;

/** The infinite line or full circle a segment lies on. */
export type Support2 =
  | { kind: 'line'; through: Vec2; direction: Vec2 }
  | { kind: 'circle'; centre: Vec2; radius: number };

export function supportOf(segment: CurveSegment2): Support2 {
  return segment.type === 'Line2'
    ? { kind: 'line', through: segment.from, direction: segment.direction() }
    : { kind: 'circle', centre: segment.centre(), radius: segment.radius() };
}

/** Crossing of two infinite lines, or `null` when they are parallel. */
export function lineLine(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denominator = d.crossProduct(e);
  const scale = d.length() * e.length();
  if (scale === 0 || Math.abs(denominator) <= Epsilon.sq * scale) return null;
  const t = q.subtract(p).crossProduct(e) / denominator;
  return p.add(d.scale(t));
}

/** Points where the line `through + t·direction` meets the circle: 0, 1 (tangent within slack) or 2. */
export function lineCircle(
  through: Vec2,
  direction: Vec2,
  centre: Vec2,
  radius: number,
  slack: Epsilon = Epsilon.preferIn,
): Vec2[] {
  const length = direction.length();
  if (length === 0) return [];
  const unit = direction.scale(1 / length);
  const foot = through.add(unit.scale(centre.subtract(through).dot(unit)));
  const height = foot.distance(centre);
  const tolerance = Math.abs(slack.value);
  if (height > radius + tolerance) return [];
  const half = Math.sqrt(Math.max(0, radius * radius - height * height));
  if (half <= tolerance) return [foot];
  return [foot.subtract(unit.scale(half)), foot.add(unit.scale(half))];
}

/** Points where two circles meet: 0 (apart, nested or concentric), 1 (tangent within slack) or 2. */
export function circleCircle(c1: Vec2, r1: number, c2: Vec2, r2: number, slack: Epsilon = Epsilon.preferIn): Vec2[] {
  const between = c2.subtract(c1);
  const d = between.length();
  const tolerance = Math.abs(slack.value);
  if (d <= tolerance) return [];
  if (d > r1 + r2 + tolerance || d < Math.abs(r1 - r2) - tolerance) return [];
  const unit = between.scale(1 / d);
  const along = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const foot = c1.add(unit.scale(along));
  const half = Math.sqrt(Math.max(0, r1 * r1 - along * along));
  if (half <= tolerance) return [foot];
  const across = unit.perpendicular().scale(half);
  return [foot.subtract(across), foot.add(across)];
}

/** Points where two supporting curves meet. */
export function supportIntersections(a: Support2, b: Support2, slack: Epsilon = Epsilon.preferIn): Vec2[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const point = lineLine(a.through, a.direction, b.through, b.direction);
    return point ? [point] : [];
  }
  if (a.kind === 'line' && b.kind === 'circle') return lineCircle(a.through, a.direction, b.centre, b.radius, slack);
  if (a.kind === 'circle' && b.kind === 'line') return lineCircle(b.through, b.direction, a.centre, a.radius, slack);
  const [c1, c2] = [a as Extract<Support2, { kind: 'circle' }>, b as Extract<Support2, { kind: 'circle' }>];
  return circleCircle(c1.centre, c1.radius, c2.centre, c2.radius, slack);
}

/** True when `point` (already on the segment's support) lies within the segment, `slack` as a distance. */
export function onSegment(segment: CurveSegment2, point: Vec2, slack: Epsilon = Epsilon.preferIn): boolean {
  if (segment.type === 'Arc2') {
    const centre = segment.centre();
    return segment.containsAngle(Math.atan2(point.y - centre.y, point.x - centre.x), slack);
  }
  const direction = segment.direction();
  const length = direction.length();
  const t = point.subtract(segment.from).dot(direction) / (length * length);
  const tolerance = slack.value / length;
  return tolerance >= 0 ? t >= -tolerance && t <= 1 + tolerance : t > -tolerance && t < 1 + tolerance;
}

/**
 * Points common to two segments. Where they overlap (collinear lines, arcs on the same circle) the
 * result holds the overlap's end points. Points closer than `slack` are merged.
 */
export function segmentIntersections(a: CurveSegment2, b: CurveSegment2, slack: Epsilon = Epsilon.preferIn): Vec2[] {
  const tolerance = Math.abs(slack.value);
  const supportA = supportOf(a);
  const supportB = supportOf(b);
  let candidates: Vec2[];

  if (sameSupport(supportA, supportB, tolerance)) {
    candidates = [a.from, a.to, b.from, b.to];
  } else {
    candidates = supportIntersections(supportA, supportB, slack);
    if (supportA.kind === 'line' && supportB.kind === 'line' && candidates.length === 0) return [];
  }

  const inclusive = Epsilon.custom(tolerance);
  const points: Vec2[] = [];
  for (const point of candidates) {
    if (a.distanceToPoint(point) > tolerance || b.distanceToPoint(point) > tolerance) continue;
    if (!onSegment(a, point, inclusive) || !onSegment(b, point, inclusive)) continue;
    if (points.every((existing) => existing.distance(point) > tolerance)) points.push(point);
  }
  return points;
}

function sameSupport(a: Support2, b: Support2, tolerance: number): boolean {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return a.centre.distance(b.centre) <= tolerance && Math.abs(a.radius - b.radius) <= tolerance;
  }
  if (a.kind === 'line' && b.kind === 'line') {
    const length = a.direction.length();
    const parallel = Math.abs(a.direction.crossProduct(b.direction)) <= tolerance * length * b.direction.length();
    const offset = Math.abs(a.direction.crossProduct(b.through.subtract(a.through))) / length;
    return parallel && offset <= tolerance;
  }
  return false;
}
