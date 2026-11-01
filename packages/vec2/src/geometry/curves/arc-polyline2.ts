import type { Coordinate, Index, Integer, Length, Tolerance } from '../../core/numbers';
import type { Mat3 } from '../../core/mat3';
import type { Aabb2 } from '../../bounds/aabb2';
import { Epsilon } from '../../core/epsilon';
import { Vec2, type Vec2Json } from '../../core/vec2';
import type { Arc2 } from '../primitives/arc2';
import type { Line2 } from '../primitives/line2';
import {
  chainAabb,
  chainFromSegments,
  chainLengthTable,
  chainSegments,
  closestLengths,
  evaluateChain,
  isKinkAt,
  locateLength,
  offsetChain,
  reverseChain,
  samplePoints,
  sliceChain,
  transformChain,
  validateChain,
  type CurveSegment2,
} from './arc-chain';
import { segmentTangent } from './arc-intersections';
import { Polyline2 } from './polyline2';

type State = { epsilon: Epsilon; segments?: CurveSegment2[]; table?: number[] };
const states = new WeakMap<ArcPolyline2, State>();

/**
 * Open chain of straight and circular segments: segment `i` runs from vertex `i` to `i + 1` and bulges
 * `sagittas[i]` to its left (0 exactly for a straight segment). It is to `Polyline2` what `Arc2` is to
 * `Line2`; the closed counterpart is `ArcPolygon2`.
 *
 * Two parameterisations: the segment parameter `u ∈ [0, k]` (integer part the segment, fraction the
 * arc-length parameter within it) and the arc length `l ∈ [0, length()]`.
 */
export class ArcPolyline2 {
  static readonly type = 'ArcPolyline2' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof ArcPolyline2.type {
    return ArcPolyline2.type;
  }

  readonly vertices: readonly Vec2[];
  /** One per segment; exactly 0 for a straight segment. */
  readonly sagittas: readonly Coordinate[];

  constructor(vertices: Vec2[], sagittas: Coordinate[], epsilon: Epsilon = Epsilon.preferIn) {
    const chain = validateChain(ArcPolyline2.type, vertices, sagittas, false, epsilon);
    this.vertices = chain.vertices;
    this.sagittas = chain.sagittas;
    states.set(this, { epsilon });
  }

  /** Chain segments that meet end to end within epsilon. */
  static fromSegments(segments: (Line2 | Arc2)[], epsilon: Epsilon = Epsilon.preferIn): ArcPolyline2 {
    const { vertices, sagittas } = chainFromSegments(ArcPolyline2.type, segments, false, epsilon);
    return new ArcPolyline2(vertices, sagittas, epsilon);
  }

  static fromPolyline(polyline: Polyline2, epsilon: Epsilon = Epsilon.preferIn): ArcPolyline2 {
    return new ArcPolyline2([...polyline.vertices], new Array(polyline.n()).fill(0), epsilon);
  }

  epsilon(): Epsilon {
    return states.get(this)!.epsilon;
  }

  segmentCount(): number {
    return this.sagittas.length;
  }

  segment(index: Index): Line2 | Arc2 {
    const segment = this.cachedSegments()[index];
    if (!segment) throw new Error(`ArcPolyline2 has no segment ${index}`);
    return segment;
  }

  segments(): (Line2 | Arc2)[] {
    return [...this.cachedSegments()];
  }

  /** Partial sums of the segment lengths: k + 1 values, starting at 0. */
  lengthTable(): number[] {
    return [...this.table()];
  }

  length(): number {
    const table = this.table();
    return table[table.length - 1]!;
  }

  /** Point at segment parameter `u ∈ [0, k]`. */
  evaluate(u: Coordinate): Vec2 {
    return evaluateChain(this.cachedSegments(), u);
  }

  /** Point at arc length `length`, clamped to `[0, length()]`. */
  evaluateAtLength(length: Length): Vec2 {
    const { index, t } = locateLength(this.table(), length, false);
    return this.cachedSegments()[index]!.evaluate(t);
  }

  /** Unit direction of travel; at a kink, the outgoing segment's. */
  tangentAtLength(length: Length): Vec2 {
    const { index, t } = locateLength(this.table(), length, false);
    return segmentTangent(this.cachedSegments()[index]!, t);
  }

  /** Unit left normal: the tangent turned counter-clockwise. */
  normalAtLength(length: Length): Vec2 {
    return this.tangentAtLength(length).perpendicular();
  }

  /** Whether the tangents differ at vertex `index`; the two ends are never kinks. */
  isKink(index: Index): boolean {
    return isKinkAt(this.cachedSegments(), index, false, this.epsilon());
  }

  /** Arc length of the nearest point; on a tie, the smallest. */
  closestLengthForPoint(point: Vec2): number {
    return this.closestLengthsForPoint(point)[0]!;
  }

  /** Arc lengths of every nearest point (within epsilon plus `additionalTolerance`), ascending. */
  closestLengthsForPoint(point: Vec2, additionalTolerance: Tolerance = 0): number[] {
    return closestLengths(this.cachedSegments(), this.table(), point, false, additionalTolerance).lengths;
  }

  closestPointForPoint(point: Vec2): Vec2 {
    return this.evaluateAtLength(this.closestLengthForPoint(point));
  }

  distanceToPoint(point: Vec2): number {
    return closestLengths(this.cachedSegments(), this.table(), point, false).distance;
  }

  /** −1 right of the path, +1 left, 0 on it, judged at the closest point. */
  sideOfPoint(point: Vec2): Integer {
    const length = this.closestLengthForPoint(point);
    const offset = point.subtract(this.evaluateAtLength(length));
    if (offset.length() <= this.epsilon().value) return 0;
    const { index, t } = locateLength(this.table(), length, false);
    // At a vertex the outgoing tangent is used; the incoming one gives the same side there.
    return Math.sign(segmentTangent(this.cachedSegments()[index]!, t).crossProduct(offset));
  }

  aabb2(): Aabb2 {
    return chainAabb(this.cachedSegments());
  }

  reverse(): ArcPolyline2 {
    const { vertices, sagittas } = reverseChain(this.vertices, this.sagittas, false);
    return new ArcPolyline2(vertices, sagittas, this.epsilon());
  }

  /** The part between arc lengths `from` and `to` (`from < to`); arcs are cut at the partial sweep. */
  slice(from: Length, to: Length): ArcPolyline2 {
    const { vertices, sagittas } = sliceChain(this.cachedSegments(), this.table(), from, to, false, this.epsilon());
    return new ArcPolyline2(vertices, sagittas, this.epsilon());
  }

  /** The two parts either side of arc length `length`. */
  split(length: Length): [ArcPolyline2, ArcPolyline2] {
    return [this.slice(0, length), this.slice(length, this.length())];
  }

  /** Maps the vertices. With arcs, only similarity transforms are allowed (see `Arc2.transform`). */
  transform(matrix: Mat3): ArcPolyline2 {
    const { vertices, sagittas } = transformChain(this.vertices, this.sagittas, matrix);
    return new ArcPolyline2(vertices, sagittas, this.epsilon());
  }

  /**
   * The path moved `distance` to the left (negative: right). Kinks are mitred up to
   * `miterLimit·|distance|` from the vertex (default 4), beyond that joined with a straight segment.
   * Throws when an arc's offset radius collapses; segments that reverse are left in place.
   */
  offset(distance: Coordinate, options: { miterLimit?: Coordinate } = {}): ArcPolyline2 {
    const { vertices, sagittas } = offsetChain(
      this.vertices,
      this.cachedSegments(),
      distance,
      false,
      options.miterLimit ?? 4,
      this.epsilon(),
    );
    return new ArcPolyline2(vertices, sagittas, this.epsilon());
  }

  /** A polyline with each arc sampled so its chords stay within `chordTolerance`. */
  toPolyline(chordTolerance: Length): Polyline2 {
    return new Polyline2(samplePoints(this.cachedSegments(), false, chordTolerance));
  }

  toJson(): ArcPolyline2Json {
    return {
      type: ArcPolyline2.type,
      vertices: this.vertices.map((v) => v.toJson()),
      sagittas: [...this.sagittas],
    };
  }

  private cachedSegments(): CurveSegment2[] {
    const state = states.get(this)!;
    state.segments ??= chainSegments(this.vertices, this.sagittas, state.epsilon);
    return state.segments;
  }

  private table(): number[] {
    const state = states.get(this)!;
    state.table ??= chainLengthTable(this.cachedSegments());
    return state.table;
  }
}

export type ArcPolyline2Json = {
  type: typeof ArcPolyline2.type;
  vertices: Vec2Json[];
  sagittas: Coordinate[];
};
