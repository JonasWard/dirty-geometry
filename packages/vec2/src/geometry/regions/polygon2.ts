import type { Index, Length, Parameter, Tolerance } from '../../core/numbers';
import type { Mat3 } from '../../core/mat3';
import type { Circle2 } from './circle2';
import { Aabb2 } from '../../bounds/aabb2';
import { Epsilon } from '../../core/epsilon';
import { Vec2, type Vec2Json } from '../../core/vec2';
import { segmentsFromVertices } from '../curves/segments';
import { Line2 } from '../primitives/line2';

const segmentsCache = new WeakMap<Polygon2, readonly Line2[]>();

/** How a polygon sampled from a circle sits on it: see {@link Polygon2.fromCircle2}. */
export type CircleFit = 'inscription' | 'circumscription' | 'sameArea';

/** Closed polygon: consecutive vertex pairs plus a segment from last to first. */
export class Polygon2 {
  static readonly type = 'Polygon2' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof Polygon2.type {
    return Polygon2.type;
  }

  readonly vertices: readonly Vec2[];

  constructor(vertices: Vec2[]) {
    if (vertices.length < 3) {
      throw new Error('Polygon2 requires at least three vertices');
    }

    this.vertices = vertices.map((v) => v.clone());
  }

  /** Closed CCW quadrilateral with the same bounds as `box`. Requires finite bounds on both axes. */
  static fromAabb2(box: Aabb2): Polygon2 {
    if (box.isInfinite()) {
      throw new Error('Polygon2.fromAabb2 requires finite bounds');
    }
    return new Polygon2(box.corners());
  }

  /**
   * A regular polygon of `segments` vertices around `circle`, counter-clockwise from angle 0. `fit`: the vertices on
   * the circle (`inscription`), the edges touching it (`circumscription`), or the same area as the circle (`sameArea`).
   */
  static fromCircle2(circle: Circle2, segments: Index, fit: CircleFit = 'inscription'): Polygon2 {
    if (!Number.isInteger(segments) || segments < 3) {
      throw new Error('Polygon2.fromCircle2 needs a whole number of at least three segments');
    }
    const step = (2 * Math.PI) / segments;
    const scale =
      fit === 'circumscription'
        ? 1 / Math.cos(step / 2)
        : fit === 'sameArea'
          ? Math.sqrt((2 * Math.PI) / (segments * Math.sin(step)))
          : 1;
    const r = circle.radius * scale;
    return new Polygon2(
      Array.from({ length: segments }, (_, i) =>
        circle.center.add(new Vec2(r * Math.cos(i * step), r * Math.sin(i * step))),
      ),
    );
  }

  /** Number of boundary segments (`vertices.length`). Parameter domain is `[0, n]`. */
  n(): number {
    return this.vertices.length;
  }

  /** Boundary segments including the closing edge (`n` segments). */
  segments(): Line2[] {
    // Vertices are readonly and segments immutable, so the list is built once; callers get a copy.
    // Kept outside the instance so equality checks and spreads don't see it.
    let cached = segmentsCache.get(this);
    if (!cached) {
      cached = segmentsFromVertices(this.vertices, true);
      segmentsCache.set(this, cached);
    }
    return cached.slice();
  }

  length(): number {
    return Line2.lengthTable(this.segments())[this.n()]!;
  }

  /**
   * Evaluate in the index domain `[0, n]`.
   * Integer `t` in `0…n - 1` returns `vertices[t]`; `t = n` returns `vertices[0]`.
   * Values wrap around the closed boundary.
   */
  evaluate(t: Parameter): Vec2 {
    const segments = this.segments();
    const period = this.n();
    const u = ((t % period) + period) % period;

    if (u >= period - Number.EPSILON) {
      return this.vertices[0]!.clone();
    }

    const segmentIndex = Math.floor(u);
    const localT = u - segmentIndex;
    return segments[segmentIndex]!.evaluate(localT);
  }

  /** Evaluate by arc length along the boundary. Values outside `[0, length()]` extrapolate. */
  evaluateAtLength(length: Length): Vec2 {
    return Line2.evaluateAtLength(this.segments(), length);
  }

  closestParametersForPoint(point: Vec2, additionalTolerance: Tolerance = 0): number[] {
    return Line2.closestToPointForSegments(this.segments(), point, additionalTolerance).tParameters;
  }

  closestPointsForPoint(point: Vec2, additionalTolerance: Tolerance = 0): Vec2[] {
    return Line2.closestToPointForSegments(this.segments(), point, additionalTolerance).points;
  }

  /** Distance to the nearest boundary edge. Allocation-free: point-in-region tests call it per loop. */
  distanceToPoint(point: Vec2): number {
    const vertices = this.vertices;
    const count = vertices.length;
    let best = Infinity;

    for (let i = 0; i < count; i++) {
      const a = vertices[i]!;
      const b = vertices[(i + 1) % count]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const px = point.x - a.x;
      const py = point.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSquared)) : 0;
      const ex = px - t * dx;
      const ey = py - t * dy;
      const distanceSquared = ex * ex + ey * ey;
      if (distanceSquared < best) best = distanceSquared;
    }

    return Math.sqrt(best);
  }

  /** Negative inside, positive outside, zero on the boundary. */
  signedDistance(point: Vec2): number {
    const distance = this.distanceToPoint(point);
    return this.containsPoint(point) ? -distance : distance;
  }

  /**
   * Even-odd signed distance over one or more boundary loops.
   * Negative inside the region, positive outside; magnitude is distance to the nearest loop edge.
   */
  static signedDistanceFromLoops(polygons: readonly Polygon2[], point: Vec2): number {
    if (polygons.length === 0) return Infinity;

    const distance = Math.min(...polygons.map((polygon) => polygon.distanceToPoint(point)));
    return Polygon2.isPointInside(polygons, point) ? -distance : distance;
  }

  aabb2(): Aabb2 {
    return Aabb2.fromPointList(this.vertices);
  }

  containsPoint(point: Vec2): boolean {
    return this.windingNumber(point) !== 0;
  }

  transform(matrix: Mat3): Polygon2 {
    return new Polygon2(this.vertices.map((v) => v.transform(matrix)));
  }

  /**
   * Non-zero winding number at `point` (positive for CCW boundary contribution).
   * Used by boolean fill rules; {@link containsPoint} is `windingNumber !== 0`.
   */
  windingNumber(point: Vec2): number {
    let winding = 0;
    const count = this.vertices.length;

    for (let i = 0; i < count; i++) {
      const a = this.vertices[i]!;
      const b = this.vertices[(i + 1) % count]!;

      if (a.y <= point.y) {
        if (b.y > point.y && Vec2.orient(a, b, point) > 0) {
          winding++;
        }
      } else if (b.y <= point.y && Vec2.orient(a, b, point) < 0) {
        winding--;
      }
    }

    return winding;
  }

  /**
   * Even-odd point-in-region test over one or more boundary loops.
   * Loops may have arbitrary orientation; boundary points count as inside when `slack` is positive.
   */
  static isPointInside(polygons: readonly Polygon2[], point: Vec2, slack: Epsilon = Epsilon.preferIn): boolean {
    if (polygons.length === 0) return false;

    const boundarySlack = Math.abs(slack.value);
    for (const polygon of polygons) {
      if (polygon.distanceToPoint(point) <= boundarySlack) {
        return slack.value > 0;
      }
    }

    let crossings = 0;
    for (const polygon of polygons) {
      const vertices = polygon.vertices;
      const count = vertices.length;

      for (let i = 0; i < count; i++) {
        const a = vertices[i]!;
        const b = vertices[(i + 1) % count]!;

        if ((a.y <= point.y && b.y > point.y) || (b.y <= point.y && a.y > point.y)) {
          const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
          if (point.x < x) crossings++;
        }
      }
    }

    return crossings % 2 === 1;
  }

  signedArea(): number {
    return Polygon2.computeSignedArea(this.vertices);
  }

  area(): number {
    return Math.abs(this.signedArea());
  }

  /** Signed area; positive when vertices are counter-clockwise. */
  static computeSignedArea(vertices: readonly Vec2[]): number {
    let area = 0;

    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]!;
      const b = vertices[(i + 1) % vertices.length]!;
      area += a.x * b.y - b.x * a.y;
    }

    return area * 0.5;
  }

  clone(): Polygon2 {
    return new Polygon2(this.vertices.map((v) => v.clone()));
  }

  inverse(): Polygon2 {
    return new Polygon2([...this.vertices].reverse());
  }

  toJson(): Polygon2Json {
    return {
      type: Polygon2.type,
      vertices: this.vertices.map((v) => v.toJson()),
    };
  }
}

export type Polygon2Json = {
  type: typeof Polygon2.type;
  vertices: Vec2Json[];
};
