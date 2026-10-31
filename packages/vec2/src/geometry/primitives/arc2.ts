import type { Coordinate, Length, Parameter, Radians, Tolerance } from '../../core/numbers';
import type { Mat3 } from '../../core/mat3';
import { Aabb2 } from '../../bounds/aabb2';
import { TAU } from '../../core/angle';
import { Epsilon } from '../../core/epsilon';
import { Vec2, type Vec2Json } from '../../core/vec2';
import { Circle2 } from '../regions/circle2';
import { Line2 } from './line2';

/** Values derived from `from`, `to` and `sagitta`, computed once per arc. */
type ArcState = {
  epsilon: Epsilon;
  derived?: {
    chordLength: number;
    radius: number;
    centre: Vec2;
    startAngle: number;
    sweep: number;
    apex: Vec2;
  };
};

/** Kept outside the instance so JSON and equality see only `from`, `to` and `sagitta`. */
const states = new WeakMap<Arc2, ArcState>();

/**
 * Circular arc from `from` to `to`, bulging `sagitta` to the left of the chord (walking `from → to`).
 *
 * - `sagitta > 0`: the arc lies left of the chord and turns clockwise.
 * - `sagitta < 0`: it lies right of the chord and turns counter-clockwise.
 * - `|sagitta|` below, at or above half the chord: a minor arc, a half circle or a major arc.
 *
 * The parameter `t ∈ [0, 1]` is proportional to arc length, as for {@link Line2}.
 */
export class Arc2 {
  static readonly type = 'Arc2' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof Arc2.type {
    return Arc2.type;
  }

  readonly from: Vec2;
  readonly to: Vec2;
  /** Signed height of the arc's midpoint above the chord's midpoint. Never 0: a straight segment is a `Line2`. */
  readonly sagitta: Coordinate;

  constructor(from: Vec2, to: Vec2, sagitta: Coordinate, epsilon: Epsilon = Epsilon.preferIn) {
    epsilon.isPositive(Arc2.type, 'new');
    if (!Number.isFinite(sagitta)) {
      throw new Error('Arc2 sagitta must be finite');
    }
    if (from.distance(to) <= epsilon.value) {
      throw new Error('Arc2 needs two distinct points: the chord has no length');
    }
    if (Math.abs(sagitta) <= epsilon.value) {
      throw new Error('Arc2 sagitta is within epsilon of 0: use a Line2 (or segmentOf)');
    }

    this.from = from.clone();
    this.to = to.clone();
    this.sagitta = sagitta;
    states.set(this, { epsilon });
  }

  /** The tolerance this arc was built with. */
  epsilon(): Epsilon {
    return state(this).epsilon;
  }

  /** Arc on the circle around `centre`, starting at `startAngle`, turning `sweep` (CCW positive, `0 < |sweep| < 2π`). */
  static fromCentre(
    centre: Vec2,
    radius: Length,
    startAngle: Radians,
    sweep: Radians,
    epsilon: Epsilon = Epsilon.preferIn,
  ): Arc2 {
    if (!(radius > epsilon.value) || !Number.isFinite(radius)) {
      throw new Error('Arc2.fromCentre radius must be finite and larger than epsilon');
    }
    if (!(Math.abs(sweep) > 0 && Math.abs(sweep) < TAU)) {
      throw new Error('Arc2.fromCentre sweep must satisfy 0 < |sweep| < 2π');
    }
    const from = centre.add(polar(startAngle, radius));
    const to = centre.add(polar(startAngle + sweep, radius));
    return new Arc2(from, to, sagittaFromSweep(radius, sweep), epsilon);
  }

  /** Arc from `from` through `through` to `to`. Throws when the three points are collinear within epsilon. */
  static fromThreePoints(from: Vec2, through: Vec2, to: Vec2, epsilon: Epsilon = Epsilon.preferIn): Arc2 {
    const chord = to.subtract(from);
    const c = chord.length();
    if (c <= epsilon.value) {
      throw new Error('Arc2.fromThreePoints needs distinct end points');
    }
    const side = chord.crossProduct(through.subtract(from)) / c; // signed distance of `through` from the chord line
    if (Math.abs(side) <= epsilon.value) {
      throw new Error('Arc2.fromThreePoints: the points are collinear');
    }
    const circle = Circle2.circumcircle(from, through, to);
    if (!circle) {
      throw new Error('Arc2.fromThreePoints: the points are collinear');
    }
    const normal = chord.scale(1 / c).perpendicular();
    const offset = circle.center.subtract(Vec2.center(from, to)).dot(normal);
    return new Arc2(from, to, offset + Math.sign(side) * circle.radius, epsilon);
  }

  /** Arc leaving `from` in direction `tangent` and ending at `to`: continues a path smoothly. */
  static fromTangent(from: Vec2, tangent: Vec2, to: Vec2, epsilon: Epsilon = Epsilon.preferIn): Arc2 {
    if (tangent.isZeroLength()) {
      throw new Error('Arc2.fromTangent needs a non-zero tangent');
    }
    return new Arc2(from, to, tangentSagitta(from, tangent, to), epsilon);
  }

  /**
   * The arc of `radius` that rounds the corner `from → corner → to`: tangent to both legs, from
   * `corner − t·u₁` to `corner + t·u₂` with `t = radius·tan(δ/2)`, where `δ` is the turning angle.
   * The caller trims the legs to `arc.from` and `arc.to`. Throws when the legs are collinear or fold
   * back, or when the fillet is longer than either leg.
   */
  static fromFillet(from: Vec2, corner: Vec2, to: Vec2, radius: Length, epsilon: Epsilon = Epsilon.preferIn): Arc2 {
    if (!(radius > epsilon.value) || !Number.isFinite(radius)) {
      throw new Error('Arc2.fromFillet radius must be finite and larger than epsilon');
    }
    const incoming = corner.subtract(from);
    const outgoing = to.subtract(corner);
    const inLength = incoming.length();
    const outLength = outgoing.length();
    if (inLength <= epsilon.value || outLength <= epsilon.value) {
      throw new Error('Arc2.fromFillet needs legs of non-zero length');
    }
    const u1 = incoming.scale(1 / inLength);
    const u2 = outgoing.scale(1 / outLength);
    const turn = Math.atan2(u1.crossProduct(u2), u1.dot(u2));
    const delta = Math.abs(turn);
    if (delta * radius <= epsilon.value) {
      throw new Error('Arc2.fromFillet: the legs are collinear, there is no corner to round');
    }
    if (Math.PI - delta <= epsilon.value) {
      throw new Error('Arc2.fromFillet: the legs fold back on each other');
    }
    const t = radius * Math.tan(delta / 2);
    if (t > inLength + epsilon.value || t > outLength + epsilon.value) {
      throw new Error('Arc2.fromFillet: the fillet is longer than a leg');
    }
    return new Arc2(corner.subtract(u1.scale(t)), corner.add(u2.scale(t)), sagittaFromSweep(radius, turn), epsilon);
  }

  chordLength(): number {
    return derived(this).chordLength;
  }

  radius(): number {
    return derived(this).radius;
  }

  centre(): Vec2 {
    return derived(this).centre;
  }

  /** Polar angle of `from` around the centre. */
  startAngle(): number {
    return derived(this).startAngle;
  }

  /** Signed sweep, counter-clockwise positive, `0 < |sweep| < 2π`. */
  sweep(): number {
    return derived(this).sweep;
  }

  length(): number {
    return this.radius() * Math.abs(this.sweep());
  }

  /** Midpoint of the arc: the chord midpoint moved `sagitta` along the chord's left normal. */
  apex(): Vec2 {
    return derived(this).apex;
  }

  circle(): Circle2 {
    return new Circle2(this.centre(), this.radius());
  }

  evaluate(t: Parameter): Vec2 {
    if (t === 0) return this.from.clone();
    if (t === 1) return this.to.clone();
    return this.centre().add(polar(this.startAngle() + t * this.sweep(), this.radius()));
  }

  evaluateAtLength(length: Length): Vec2 {
    return this.evaluate(length / this.length());
  }

  /** Unit direction of travel. */
  tangent(t: Parameter): Vec2 {
    const angle = this.startAngle() + t * this.sweep();
    const sign = Math.sign(this.sweep());
    return new Vec2(-Math.sin(angle) * sign, Math.cos(angle) * sign);
  }

  /** Unit left normal: the tangent turned counter-clockwise. */
  normal(t: Parameter): Vec2 {
    return this.tangent(t).perpendicular();
  }

  /** Signed curvature, counter-clockwise positive: `−sign(sagitta) / radius`. */
  curvature(): number {
    return -Math.sign(this.sagitta) / this.radius();
  }

  /**
   * Whether polar angle `radians` (around the centre) lies within the sweep. `slack` is a distance along
   * the arc: positive includes angles just past the ends, negative excludes the ends.
   */
  containsAngle(radians: Radians, slack: Epsilon | Tolerance = 0): boolean {
    const tolerance = (typeof slack === 'number' ? slack : slack.value) / this.radius();
    const offset = this.angleOffset(radians);
    const sweep = Math.abs(this.sweep());
    if (tolerance >= 0) return offset <= sweep + tolerance || offset >= TAU - tolerance;
    return offset > -tolerance && offset < sweep + tolerance;
  }

  /** Parameter of polar angle `radians`, measured from the start in the direction of travel; may exceed 1. */
  parameterOfAngle(radians: Radians): number {
    return this.angleOffset(radians) / Math.abs(this.sweep());
  }

  /** Angle from the start to `radians`, in the direction of travel, in `[0, 2π)`. */
  private angleOffset(radians: Radians): number {
    const raw = (radians - this.startAngle()) * Math.sign(this.sweep());
    const wrapped = raw - TAU * Math.floor(raw / TAU);
    return wrapped >= TAU ? 0 : wrapped;
  }

  /** Nearest parameter: the projection onto the circle when it is within the sweep, else the nearer end. */
  closestParameterForPoint(point: Vec2): number {
    const centre = this.centre();
    if (point.distance(centre) <= Epsilon.sq) return 0;
    const angle = Math.atan2(point.y - centre.y, point.x - centre.x);
    if (this.containsAngle(angle)) {
      return Math.min(1, this.parameterOfAngle(angle));
    }
    return point.distance(this.to) < point.distance(this.from) ? 1 : 0;
  }

  closestPointForPoint(point: Vec2): Vec2 {
    return this.evaluate(this.closestParameterForPoint(point));
  }

  distanceToPoint(point: Vec2): number {
    return point.distance(this.closestPointForPoint(point));
  }

  /** The end points plus every extreme point of the circle (0, π/2, π, 3π/2) inside the sweep. */
  aabb2(): Aabb2 {
    const points = [this.from, this.to];
    const centre = this.centre();
    const radius = this.radius();
    for (let k = 0; k < 4; k++) {
      const angle = (k * Math.PI) / 2;
      if (this.containsAngle(angle)) points.push(centre.add(polar(angle, radius)));
    }
    return Aabb2.fromPointList(points);
  }

  reverse(): Arc2 {
    return new Arc2(this.to, this.from, -this.sagitta, this.epsilon());
  }

  /**
   * The concentric arc `distance` to the left (along {@link normal}): same centre and sweep, radius
   * `r + sign(sagitta)·distance`. Throws when the radius collapses.
   */
  offset(distance: Coordinate): Arc2 {
    const radius = this.radius() + Math.sign(this.sagitta) * distance;
    if (radius <= this.epsilon().value) {
      throw new Error('Arc2.offset: the offset radius collapses');
    }
    return Arc2.fromCentre(this.centre(), radius, this.startAngle(), this.sweep(), this.epsilon());
  }

  /**
   * Similarity transforms only (rotation, uniform scale, translation, reflection): the end points are
   * mapped and the sagitta scales with the transform, changing sign under a reflection.
   */
  transform(matrix: Mat3): Arc2 {
    const { scale, determinant } = similarityOf(matrix);
    return new Arc2(
      this.from.transform(matrix),
      this.to.transform(matrix),
      this.sagitta * scale * Math.sign(determinant),
      this.epsilon(),
    );
  }

  /**
   * Points along the arc, both ends included, in the fewest equal steps whose chords stay within
   * `chordTolerance` of the arc.
   */
  toPolyline(chordTolerance: Length): Vec2[] {
    const steps = arcSteps(this.radius(), Math.abs(this.sweep()), chordTolerance);
    const points = [this.from.clone()];
    for (let i = 1; i < steps; i++) points.push(this.evaluate(i / steps));
    points.push(this.to.clone());
    return points;
  }

  toJson(): Arc2Json {
    return { type: Arc2.type, from: this.from.toJson(), to: this.to.toJson(), sagitta: this.sagitta };
  }
}

export type Arc2Json = {
  type: typeof Arc2.type;
  from: Vec2Json;
  to: Vec2Json;
  sagitta: Coordinate;
};

/** A `Line2` when `|sagitta| ≤ epsilon`, otherwise an `Arc2`. */
export function segmentOf(
  from: Vec2,
  to: Vec2,
  sagitta: Coordinate,
  epsilon: Epsilon = Epsilon.preferIn,
): Line2 | Arc2 {
  return Math.abs(sagitta) <= epsilon.value
    ? new Line2(from.clone(), to.clone())
    : new Arc2(from, to, sagitta, epsilon);
}

/** Sagitta of an arc of `radius` with signed `sweep` (CCW positive): `|s| = r·(1 − cos(θ/2))`, sign `−sign(sweep)`. */
export function sagittaFromSweep(radius: Length, sweep: Radians): Coordinate {
  return -Math.sign(sweep) * radius * (1 - Math.cos(Math.abs(sweep) / 2));
}

/** Sagitta of the arc leaving `from` along `tangent` and ending at `to` (0 when that arc is straight). */
export function tangentSagitta(from: Vec2, tangent: Vec2, to: Vec2): Coordinate {
  const chord = to.subtract(from);
  const halfSweep = Math.atan2(tangent.crossProduct(chord), tangent.dot(chord));
  const sagitta = -Math.sign(halfSweep) * (chord.length() / 2) * Math.tan(Math.abs(halfSweep) / 2);
  if (!Number.isFinite(sagitta)) {
    throw new Error('Arc2.fromTangent: the end point lies straight behind the start');
  }
  return sagitta;
}

/** Number of equal steps over `sweep` so each chord's sagitta is at most `chordTolerance`. */
export function arcSteps(radius: Length, sweep: Radians, chordTolerance: Length): number {
  if (!(chordTolerance > 0)) {
    throw new Error('chordTolerance must be positive');
  }
  const ratio = 1 - chordTolerance / radius;
  const step = ratio <= -1 ? TAU : 2 * Math.acos(ratio);
  return Math.max(1, Math.ceil(sweep / step - 1e-9));
}

/** Uniform scale and determinant of a similarity transform; throws for a non-uniform scale or shear. */
export function similarityOf(matrix: Mat3): { scale: number; determinant: number } {
  const [a, b, , c, d] = matrix.elements;
  const first = a * a + b * b;
  const second = c * c + d * d;
  const size = Math.max(first, second);
  const tolerance = Epsilon.value * size;
  if (size === 0 || Math.abs(a * c + b * d) > tolerance || Math.abs(first - second) > tolerance) {
    throw new Error('Arcs can only be transformed by a similarity (rotation, uniform scale, reflection)');
  }
  return { scale: Math.sqrt(first), determinant: a * d - b * c };
}

function polar(angle: number, radius: number): Vec2 {
  return new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function state(arc: Arc2): ArcState {
  return states.get(arc)!;
}

function derived(arc: Arc2): NonNullable<ArcState['derived']> {
  const entry = state(arc);
  if (entry.derived) return entry.derived;

  const s = arc.sagitta;
  const chord = arc.to.subtract(arc.from);
  const chordLength = chord.length();
  const normal = chord.scale(1 / chordLength).perpendicular();
  const middle = Vec2.center(arc.from, arc.to);
  const radius = ((chordLength * chordLength) / 4 + s * s) / (2 * Math.abs(s));
  const centre = middle.add(normal.scale(s - Math.sign(s) * radius));
  const sweep = -Math.sign(s) * 4 * Math.atan((2 * Math.abs(s)) / chordLength);
  const startAngle = Math.atan2(arc.from.y - centre.y, arc.from.x - centre.x);
  entry.derived = { chordLength, radius, centre, startAngle, sweep, apex: middle.add(normal.scale(s)) };
  return entry.derived;
}
