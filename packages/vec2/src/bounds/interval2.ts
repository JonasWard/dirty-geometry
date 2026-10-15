import { Epsilon } from '../core/epsilon';

/** Closed numeric interval `[min, max]`. Endpoints may be `±Infinity`. */
export class Interval2 {
  static readonly type = 'Interval2' as const;
  static readonly unit = Object.freeze(new Interval2(0, 1));
  static readonly ray = Object.freeze(new Interval2(0, Infinity));
  /** Closed negative indexes `(-∞, -1]`. */
  static readonly negativeRay = Object.freeze(new Interval2(-Infinity, -1));
  static readonly infinite = Object.freeze(new Interval2(-Infinity, Infinity));

  constructor(
    readonly min: number,
    readonly max: number,
  ) {
    if (!Interval2.hasInfiniteEndpoint(min, max) && min > max) {
      throw new Error('Interval2 min must be less than or equal to max');
    }
  }

  /** Empty accumulator; expand via `including` before reading bounds. */
  static empty(): Interval2 {
    return new Interval2(Infinity, -Infinity);
  }

  /** Floor endpoints to integers, clamp into `range`, and order so min ≤ max. */
  static clampedInteger(
    domain: { readonly min: number; readonly max: number },
    range: { readonly min: number; readonly max: number },
  ): Interval2 {
    const min = Math.max(range.min, Math.floor(domain.min));
    const max = Math.min(range.max, Math.floor(domain.max));
    return new Interval2(Math.min(min, max), Math.max(min, max));
  }

  /**
   * Bounding hull of every item — a single interval spanning them all, gaps included.
   * @see merge for the gap-aware disjoint union.
   */
  static union(...items: readonly (Interval2 | number)[]): Interval2 {
    if (items.length === 0) {
      throw new Error('Interval2.union requires at least one item');
    }

    let result = Interval2.empty();
    for (const item of items) {
      result = result.including(item);
    }
    return result;
  }

  /**
   * Disjoint union: overlapping or touching intervals fused, sorted by `min`.
   * `Epsilon.preferOut` keeps merely touching intervals apart.
   * @see union for the bounding hull.
   */
  static merge(intervals: readonly Interval2[], slack: Epsilon = Epsilon.preferIn): Interval2[] {
    if (intervals.length === 0) return [];

    const sorted = [...intervals].sort((a, b) => a.min - b.min);
    const merged: Interval2[] = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]!;
      const prev = merged[merged.length - 1]!;
      if (curr.min <= prev.max + slack.value) {
        merged[merged.length - 1] = new Interval2(prev.min, Math.max(prev.max, curr.max));
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }

  /** Portions of `within` left uncovered by `covered` (merged first); empty ⇒ fully covered. */
  static complement(
    covered: readonly Interval2[],
    within: Interval2 = Interval2.unit,
    slack: Epsilon = Epsilon.preferIn,
  ): Interval2[] {
    const merged = Interval2.merge(covered, slack);
    // A seam narrower than the tolerance is not a gap — `preferOut` must not report zero-width ones.
    const minGap = Math.abs(slack.value);
    const free: Interval2[] = [];
    let cursor = within.min;

    for (const span of merged) {
      if (span.min - cursor > minGap) {
        free.push(new Interval2(cursor, Math.min(span.min, within.max)));
      }
      cursor = Math.max(cursor, span.max);
      if (cursor >= within.max) break;
    }

    if (within.max - cursor > minGap) {
      free.push(new Interval2(Math.max(cursor, within.min), within.max));
    }

    return free;
  }

  /** Widest interval, ignoring any no wider than `slack`; `null` when none qualifies. */
  static longest(intervals: readonly Interval2[], slack: Epsilon = Epsilon.preferIn): Interval2 | null {
    let best: Interval2 | null = null;
    for (const span of intervals) {
      if (span.width() <= slack.value) continue;
      if (!best || span.width() > best.width()) best = span;
    }
    return best;
  }

  scale(factor: number): Interval2 {
    return new Interval2(this.min * factor, this.max * factor);
  }

  offset(offset: number): Interval2 {
    return new Interval2(this.min + offset, this.max + offset);
  }

  clamp(t: number): number {
    return Math.max(this.min, Math.min(this.max, t));
  }

  contains(value: number, slack: Epsilon = Epsilon.preferIn): boolean {
    return value >= this.min - slack.value && value <= this.max + slack.value;
  }

  /**
   * Integers this closed interval contains, low → high.
   * Requires finite endpoints.
   */
  *countUp(): Generator<number, void, undefined> {
    if (!Number.isFinite(this.min) || !Number.isFinite(this.max)) {
      throw new Error('Interval2.countUp requires finite endpoints');
    }

    for (let index = this.min; index <= this.max; index++) {
      yield index;
    }
  }

  /**
   * Integers this closed interval contains, high → low.
   * Requires finite endpoints.
   */
  *countDown(): Generator<number, void, undefined> {
    if (!Number.isFinite(this.min) || !Number.isFinite(this.max)) {
      throw new Error('Interval2.countDown requires finite endpoints');
    }

    for (let index = this.max; index >= this.min; index--) {
      yield index;
    }
  }

  /** True when this interval fully covers `other`, honoring boundary tolerance. */
  containsInterval(other: Interval2, slack: Epsilon = Epsilon.preferIn): boolean {
    return other.min >= this.min - slack.value && other.max <= this.max + slack.value;
  }

  /** Negative inside, positive outside, zero on the boundary. */
  signedDistance(value: number): number {
    if (this.isFullyInfinite()) return -Infinity;
    if (Number.isFinite(this.min) && value < this.min) return this.min - value;
    if (Number.isFinite(this.max) && value > this.max) return value - this.max;

    return -Math.min(value - this.min, this.max - value);
  }

  width(): number {
    return this.isInfinite() ? Infinity : this.max - this.min;
  }

  isInfinite(): boolean {
    return Interval2.hasInfiniteEndpoint(this.min, this.max);
  }

  isFullyInfinite(): boolean {
    return this.min === -Infinity && this.max === Infinity;
  }

  isInteger(): boolean {
    return Number.isInteger(this.min) && Number.isInteger(this.max);
  }

  equals(other: Interval2): boolean {
    return this.containsInterval(other) && other.containsInterval(this);
  }

  /** New interval that also covers a scalar or another interval. */
  including(value: number | Interval2): Interval2 {
    const [min, max] = typeof value === 'number' ? [value, value] : [value.min, value.max];
    return new Interval2(Interval2.mergeMin(this.min, min), Interval2.mergeMax(this.max, max));
  }

  /** Image of `origin + t * delta` for `t` in this interval. */
  mapLinear(origin: number, delta: number): Interval2 {
    if (Math.abs(delta) < Epsilon.value) {
      return new Interval2(origin, origin);
    }

    const a = origin + this.min * delta;
    const b = origin + this.max * delta;
    return new Interval2(Math.min(a, b), Math.max(a, b));
  }

  /** Overlap with `other`, or `null` when empty beyond slack. */
  intersect(other: Interval2, slack: Epsilon = Epsilon.preferIn): Interval2 | null {
    const min = Math.max(this.min, other.min);
    const max = Math.min(this.max, other.max);

    if (min > max + slack.value) {
      return null;
    }

    return new Interval2(Math.min(min, max), Math.max(min, max));
  }

  /** Set difference `this \ other` as 0-2 intervals (empty when fully covered). */
  difference(other: Interval2, slack: Epsilon = Epsilon.preferIn): Interval2[] {
    if (!this.intersect(other, slack)) {
      return [this.clone()];
    }

    const parts: Interval2[] = [];

    if (this.min < other.min - slack.value) {
      parts.push(new Interval2(this.min, Math.min(this.max, other.min)));
    }

    if (this.max > other.max + slack.value) {
      parts.push(new Interval2(Math.max(this.min, other.max), this.max));
    }

    return parts;
  }

  negate(): Interval2 {
    return new Interval2(-this.max, -this.min);
  }

  clone(): Interval2 {
    return new Interval2(this.min, this.max);
  }

  toJson(): Interval2Json {
    return { type: Interval2.type, min: this.min, max: this.max };
  }

  private static hasInfiniteEndpoint(min: number, max: number): boolean {
    return !Number.isFinite(min) || !Number.isFinite(max);
  }

  private static mergeMax(current: number, next: number): number {
    if (!Number.isFinite(next)) return Infinity;
    if (current === -Infinity) return next;
    if (!Number.isFinite(current)) return current;
    return Math.max(current, next);
  }

  private static mergeMin(current: number, next: number): number {
    if (!Number.isFinite(next)) return -Infinity;
    if (current === Infinity) return next;
    if (!Number.isFinite(current)) return current;
    return Math.min(current, next);
  }
}

export type Interval2Json = {
  type: typeof Interval2.type;
  min: number;
  max: number;
};
