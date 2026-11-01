import type { Coordinate, Index, Length, Tolerance } from '../../core/numbers';
import type { Mat3 } from '../../core/mat3';
import type { Aabb2 } from '../../bounds/aabb2';
import { Epsilon } from '../../core/epsilon';
import { Vec2, type Vec2Json } from '../../core/vec2';
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
  segmentTangent,
  sliceChain,
  transformChain,
  validateChain,
  type CurveSegment2,
} from '../curves/arc-chain';
import { ArcPolyline2 } from '../curves/arc-polyline2';
import type { Arc2 } from '../primitives/arc2';
import type { Line2 } from '../primitives/line2';
import type { Circle2 } from './circle2';
import { Polygon2 } from './polygon2';
import { insideByRule, windingStep, type FillRule } from './winding';

type State = { epsilon: Epsilon; segments?: CurveSegment2[]; table?: number[] };
const states = new WeakMap<ArcPolygon2, State>();

/**
 * Region bounded by a closed chain of straight and circular segments: segment `i` runs from vertex
 * `i` to `i + 1`, the last one back to vertex 0, and bulges `sagittas[i]` to its left (0 exactly for a
 * straight segment). It is to `Polygon2` what `ArcPolyline2` is to `Polyline2`. Counter-clockwise
 * boundaries have positive area; clockwise ones act as holes in fill rules.
 */
export class ArcPolygon2 {
  static readonly type = 'ArcPolygon2' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof ArcPolygon2.type {
    return ArcPolygon2.type;
  }

  readonly vertices: readonly Vec2[];
  /** One per segment (as many as vertices); exactly 0 for a straight segment. */
  readonly sagittas: readonly Coordinate[];

  constructor(vertices: Vec2[], sagittas: Coordinate[], epsilon: Epsilon = Epsilon.preferIn) {
    const chain = validateChain(ArcPolygon2.type, vertices, sagittas, true, epsilon);
    this.vertices = chain.vertices;
    this.sagittas = chain.sagittas;
    states.set(this, { epsilon });
  }

  /** A closed loop of segments meeting end to end within epsilon. */
  static fromSegments(segments: (Line2 | Arc2)[], epsilon: Epsilon = Epsilon.preferIn): ArcPolygon2 {
    const { vertices, sagittas } = chainFromSegments(ArcPolygon2.type, segments, true, epsilon);
    return new ArcPolygon2(vertices, sagittas, epsilon);
  }

  static fromPolygon(polygon: Polygon2, epsilon: Epsilon = Epsilon.preferIn): ArcPolygon2 {
    return new ArcPolygon2([...polygon.vertices], new Array(polygon.vertices.length).fill(0), epsilon);
  }

  /** The circle as two counter-clockwise half arcs, starting at angle 0. */
  static fromCircle2(circle: Circle2, epsilon: Epsilon = Epsilon.preferIn): ArcPolygon2 {
    const { center, radius } = circle;
    const east = center.add(new Vec2(radius, 0));
    const west = center.add(new Vec2(-radius, 0));
    return new ArcPolygon2([east, west], [-radius, -radius], epsilon);
  }

  epsilon(): Epsilon {
    return states.get(this)!.epsilon;
  }

  segmentCount(): number {
    return this.sagittas.length;
  }

  segment(index: Index): Line2 | Arc2 {
    const segment = this.cachedSegments()[index];
    if (!segment) throw new Error(`ArcPolygon2 has no segment ${index}`);
    return segment;
  }

  segments(): (Line2 | Arc2)[] {
    return [...this.cachedSegments()];
  }

  /** Partial sums of the segment lengths: k + 1 values, starting at 0. */
  lengthTable(): number[] {
    return [...this.table()];
  }

  /** Perimeter. */
  length(): number {
    const table = this.table();
    return table[table.length - 1]!;
  }

  /** Point at segment parameter `u ∈ [0, k]`; `u = k` is vertex 0 again. */
  evaluate(u: Coordinate): Vec2 {
    return evaluateChain(this.cachedSegments(), u);
  }

  evaluateAtLength(length: Length): Vec2 {
    const { index, t } = locateLength(this.table(), length, true);
    return this.cachedSegments()[index]!.evaluate(t);
  }

  /** Unit direction of travel; at a kink, the outgoing segment's. */
  tangentAtLength(length: Length): Vec2 {
    const { index, t } = locateLength(this.table(), length, true);
    return segmentTangent(this.cachedSegments()[index]!, t);
  }

  normalAtLength(length: Length): Vec2 {
    return this.tangentAtLength(length).perpendicular();
  }

  isKink(index: Index): boolean {
    return isKinkAt(this.cachedSegments(), index, true, this.epsilon());
  }

  closestLengthForPoint(point: Vec2): number {
    return this.closestLengthsForPoint(point)[0]!;
  }

  closestLengthsForPoint(point: Vec2, additionalTolerance: Tolerance = 0): number[] {
    return closestLengths(this.cachedSegments(), this.table(), point, true, additionalTolerance).lengths;
  }

  closestPointForPoint(point: Vec2): Vec2 {
    return this.evaluateAtLength(this.closestLengthForPoint(point));
  }

  /** Distance to the boundary. */
  distanceToPoint(point: Vec2): number {
    return closestLengths(this.cachedSegments(), this.table(), point, true).distance;
  }

  /** Negative inside, positive outside, zero on the boundary. */
  signedDistance(point: Vec2): number {
    const distance = this.distanceToPoint(point);
    return this.containsPoint(point) ? -distance : distance;
  }

  containsPoint(point: Vec2): boolean {
    return this.windingNumber(point) !== 0;
  }

  /**
   * Winding number at `point`: that of the chord polygon, corrected by ±1 inside each arc's cap (the
   * region between chord and arc). A cap bulging right of travel adds, one bulging left subtracts.
   */
  windingNumber(point: Vec2): number {
    let winding = 0;
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = this.vertices[i]!;
      const b = this.vertices[(i + 1) % n]!;
      winding += windingStep(a.x, a.y, b.x, b.y, point.x, point.y);
    }
    for (const segment of this.cachedSegments()) {
      if (segment.type === 'Arc2' && inCap(segment, point)) winding -= Math.sign(segment.sagitta);
    }
    return winding;
  }

  /**
   * Point-in-region test over one or more boundary loops, by `rule` (even-odd by default). Boundary
   * points count as inside when `slack` is positive.
   */
  static isPointInside(
    loops: readonly ArcPolygon2[],
    point: Vec2,
    slack: Epsilon = Epsilon.preferIn,
    rule: FillRule = 'evenOdd',
  ): boolean {
    if (loops.length === 0) return false;
    const boundarySlack = Math.abs(slack.value);
    for (const loop of loops) {
      if (loop.distanceToPoint(point) <= boundarySlack) return slack.value > 0;
    }
    const winding = loops.reduce((sum, loop) => sum + loop.windingNumber(point), 0);
    return insideByRule(winding, rule);
  }

  /** Signed area, positive counter-clockwise: the chord polygon's plus or minus each arc's cap. */
  signedArea(): number {
    let area = Polygon2.computeSignedArea(this.vertices);
    for (const segment of this.cachedSegments()) {
      if (segment.type !== 'Arc2') continue;
      const radius = segment.radius();
      const sweep = Math.abs(segment.sweep());
      area -= Math.sign(segment.sagitta) * ((radius * radius) / 2) * (sweep - Math.sin(sweep));
    }
    return area;
  }

  area(): number {
    return Math.abs(this.signedArea());
  }

  aabb2(): Aabb2 {
    return chainAabb(this.cachedSegments());
  }

  /** The same boundary walked the other way; vertex 0 stays first. */
  inverse(): ArcPolygon2 {
    const { vertices, sagittas } = reverseChain(this.vertices, this.sagittas, true);
    return new ArcPolygon2(vertices, sagittas, this.epsilon());
  }

  /** The boundary between arc lengths `from` and `to`; with `to < from` it wraps round through vertex 0. */
  slice(from: Length, to: Length): ArcPolyline2 {
    const { vertices, sagittas } = sliceChain(this.cachedSegments(), this.table(), from, to, true, this.epsilon());
    return new ArcPolyline2(vertices, sagittas, this.epsilon());
  }

  /** Maps the vertices. With arcs, only similarity transforms are allowed (see `Arc2.transform`). */
  transform(matrix: Mat3): ArcPolygon2 {
    const { vertices, sagittas } = transformChain(this.vertices, this.sagittas, matrix);
    return new ArcPolygon2(vertices, sagittas, this.epsilon());
  }

  /**
   * The boundary moved `distance` to the left of travel (inwards for a counter-clockwise boundary),
   * joined as in `ArcPolyline2.offset`, including the join at vertex 0.
   */
  offset(distance: Coordinate, options: { miterLimit?: Coordinate } = {}): ArcPolygon2 {
    const { vertices, sagittas } = offsetChain(
      this.vertices,
      this.cachedSegments(),
      distance,
      true,
      options.miterLimit ?? 4,
      this.epsilon(),
    );
    return new ArcPolygon2(vertices, sagittas, this.epsilon());
  }

  /** A polygon with each arc sampled so its chords stay within `chordTolerance`. */
  toPolygon(chordTolerance: Length): Polygon2 {
    return new Polygon2(samplePoints(this.cachedSegments(), true, chordTolerance));
  }

  toJson(): ArcPolygon2Json {
    return {
      type: ArcPolygon2.type,
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

export type ArcPolygon2Json = {
  type: typeof ArcPolygon2.type;
  vertices: Vec2Json[];
  sagittas: Coordinate[];
};

/**
 * Inside the region between an arc and its chord: inside the circle, on the bulge side of the chord.
 * A point on the chord is decided as `windingStep` decides a point on an edge: as if moved slightly
 * towards +x (or, for a horizontal chord, +y), so chord polygon and caps agree.
 */
function inCap(arc: Arc2, point: Vec2): boolean {
  if (point.distance(arc.centre()) >= arc.radius()) return false;
  const chord = arc.to.subtract(arc.from);
  const side = chord.crossProduct(point.subtract(arc.from));
  const sign = side !== 0 ? Math.sign(side) : chord.y !== 0 ? -Math.sign(chord.y) : Math.sign(chord.x);
  return sign === Math.sign(arc.sagitta);
}
