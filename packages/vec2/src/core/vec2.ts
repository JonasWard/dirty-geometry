import type { Coordinate } from './numbers';
import { hash2scale } from '../hash/core';
import { Angle, type AngleOptions } from './angle';
import { Epsilon } from './epsilon';
import type { Mat3 } from './mat3';

export class Vec2 {
  static readonly type = 'Vec2' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof Vec2.type {
    return Vec2.type;
  }

  constructor(
    readonly x: Coordinate = 0,
    readonly y: Coordinate = 0,
  ) {}

  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  scale(factor: Coordinate): Vec2 {
    return new Vec2(this.x * factor, this.y * factor);
  }

  unit(): Vec2 {
    if (this.length() < Epsilon.value) {
      throw new Error('Vec2.unit cannot be called on a zero vector');
    }
    return this.scale(1 / this.length());
  }

  negate(): Vec2 {
    return this.scale(-1);
  }

  perpendicular(): Vec2 {
    return new Vec2(-this.y, this.x);
  }

  distance(other: Vec2): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  isZeroLength(): boolean {
    return this.length() < Epsilon.value;
  }

  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }

  /** parallel (same direction) */
  parallelCondition(other: Vec2, slack: Epsilon = Epsilon.preferIn): 'parallel' | 'antiparallel' | null {
    const lenProduct = this.length() * other.length();

    if (lenProduct < Epsilon.sq) {
      return null;
    }

    const sinTheta = this.crossProduct(other) / lenProduct;

    if (Math.abs(sinTheta) >= slack.value) {
      return null;
    }

    return this.dot(other) >= 0 ? 'parallel' : 'antiparallel';
  }

  /** parallel or antiparallel */
  parallel(other: Vec2, slack: Epsilon = Epsilon.preferIn): boolean {
    return this.parallelCondition(other, slack) !== null;
  }

  /** antiparallel (opposite direction) */
  antiparallel(other: Vec2, slack: Epsilon = Epsilon.preferIn): boolean {
    return this.parallelCondition(other, slack) === 'antiparallel';
  }

  /** Z component of the 3D cross product when both vectors have z = 0. */
  crossProduct(other: Vec2): number {
    return this.x * other.y - this.y * other.x;
  }

  /**
   * Signed parallelogram area of triangle `a→b→c` (`(b-a)×(c-a)`).
   * Positive ⇒ CCW / `c` left of `a→b`; negative ⇒ CW / right; near zero ⇒ collinear.
   */
  static orient(a: Vec2, b: Vec2, c: Vec2): number {
    // (b - a) × (c - a), written out so no temporary vectors are allocated.
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  /** Transform as a point (translation applies). */
  transform(matrix: Mat3): Vec2 {
    const e = matrix.elements;
    return new Vec2(e[0]! * this.x + e[3]! * this.y + e[6]!, e[1]! * this.x + e[4]! * this.y + e[7]!);
  }

  /** Transform as a direction: only the linear part of `matrix` applies, translation is ignored. */
  transformDirection(matrix: Mat3): Vec2 {
    const e = matrix.elements;
    return new Vec2(e[0]! * this.x + e[3]! * this.y, e[1]! * this.x + e[4]! * this.y);
  }

  hash(scale: Coordinate = Epsilon.value): number {
    return hash2scale(this.x, this.y, scale);
  }

  toJson(): Vec2Json {
    return { type: Vec2.type, x: this.x, y: this.y };
  }

  static origin(): Vec2 {
    return new Vec2(0, 0);
  }

  static baseX(): Vec2 {
    return new Vec2(1, 0);
  }

  static baseY(): Vec2 {
    return new Vec2(0, 1);
  }

  static center(...points: Vec2[]): Vec2 {
    if (points.length === 0) {
      throw new Error('Vec2.center requires at least one point');
    }

    let sumX = 0;
    let sumY = 0;

    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }

    return new Vec2(sumX / points.length, sumY / points.length);
  }

  /** Directed CCW angle from this vector to `other`, in `[0, 2π)`. */
  angleWith(other: Vec2, options?: AngleOptions): Angle {
    return Angle.fromTwoVectors(this, other, options);
  }

  /** Smallest unsigned angle between this vector and `other`, in `[0, π]`. */
  angleWithSmallest(other: Vec2, options?: AngleOptions): Angle {
    return Angle.fromTwoVectors(this, other, { ...options, ignoreSens: true });
  }

  /** Absolute polar angle from +X, in `[0, 2π)` (or `[0, π]` when `ignoreSens`). */
  anglePositive(options?: AngleOptions): Angle {
    return Angle.vectorWithX(this, options);
  }
}

export type Vec2Json = {
  type: typeof Vec2.type;
  x: Coordinate;
  y: Coordinate;
};
