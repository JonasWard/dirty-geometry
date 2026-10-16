import { describe, expect, test } from 'bun:test';
import { Interval2 } from '../../src/bounds/interval2';
import { Epsilon } from '../../src/core/epsilon';
import { expectClose } from '../testHelpers';

describe('Interval2', () => {
  test('unit interval clamps to [0, 1]', () => {
    expect(Interval2.unit.clamp(-1)).toBe(0);
    expect(Interval2.unit.clamp(0.5)).toBe(0.5);
    expect(Interval2.unit.clamp(2)).toBe(1);
  });

  test('ray interval clamps to [0, Infinity]', () => {
    expect(Interval2.ray.clamp(-3)).toBe(0);
    expect(Interval2.ray.clamp(5)).toBe(5);
  });

  test('infinite interval is identity clamp', () => {
    expect(Interval2.infinite.clamp(-100)).toBe(-100);
    expect(Interval2.infinite.clamp(100)).toBe(100);
  });

  test('countUp and countDown yield contained indexes', () => {
    expect([...new Interval2(2, 5).countUp()]).toEqual([2, 3, 4, 5]);
    expect([...new Interval2(2, 5).countDown()]).toEqual([5, 4, 3, 2]);
  });

  test('toJson', () => {
    expect(Interval2.unit.toJson()).toEqual({
      type: 'Interval2',
      min: 0,
      max: 1,
    });
  });

  test('mapLinear on finite interval', () => {
    const mapped = new Interval2(0, 2).mapLinear(1, 3);
    expect(mapped.min).toBe(1);
    expect(mapped.max).toBe(7);

    const reversed = new Interval2(0, 2).mapLinear(1, -3);
    expect(reversed.min).toBe(-5);
    expect(reversed.max).toBe(1);
  });

  test('mapLinear with zero delta is constant', () => {
    const mapped = Interval2.infinite.mapLinear(4, 0);
    expect(mapped.min).toBe(4);
    expect(mapped.max).toBe(4);
  });

  test('mapLinear on ray interval respects direction sign', () => {
    expect(Interval2.ray.mapLinear(5, -2)).toEqual(new Interval2(-Infinity, 5));
    expect(Interval2.ray.mapLinear(1, 3)).toEqual(new Interval2(1, Infinity));
  });

  test('mapLinear on infinite interval is unbounded unless delta is zero', () => {
    expect(Interval2.infinite.mapLinear(0, 2)).toEqual(new Interval2(-Infinity, Infinity));
    expect(Interval2.infinite.mapLinear(4, 0)).toEqual(new Interval2(4, 4));
  });

  test('including and union expand intervals without mutating', () => {
    const interval = new Interval2(1, 3);
    const wider = interval.including(5);
    expect([wider.min, wider.max]).toEqual([1, 5]);
    expect([interval.min, interval.max]).toEqual([1, 3]);

    const widest = wider.including(new Interval2(-1, 0));
    expect([widest.min, widest.max]).toEqual([-1, 5]);

    expect(Interval2.union(new Interval2(0, 2), 4, new Interval2(3, 6))).toEqual(new Interval2(0, 6));
  });

  test('shared constants are frozen', () => {
    expect(Object.isFrozen(Interval2.unit)).toBe(true);
    expect(() => {
      (Interval2.unit as { max: number }).max = 2;
    }).toThrow();
    expect(Interval2.unit.max).toBe(1);
  });

  test('containsInterval respects slack', () => {
    const outer = new Interval2(0, 10);
    const inner = new Interval2(0, 5);
    const flush = new Interval2(0, 10);

    expect(outer.containsInterval(inner)).toBe(true);
    expect(outer.containsInterval(flush, Epsilon.preferIn)).toBe(true);
    expect(outer.containsInterval(flush, Epsilon.preferOut)).toBe(false);
    expect(outer.containsInterval(new Interval2(0, 10.0001), Epsilon.custom(0.001))).toBe(true);
    expect(outer.containsInterval(new Interval2(0.0001, 5), Epsilon.custom(-0.001))).toBe(false);
    expect(outer.containsInterval(new Interval2(0.002, 5), Epsilon.custom(-0.001))).toBe(true);
  });

  test('signedDistance is negative inside, zero on boundary, positive outside', () => {
    const interval = new Interval2(0, 10);
    expectClose(interval.signedDistance(5), -5);
    expectClose(interval.signedDistance(0), 0);
    expectClose(interval.signedDistance(12), 2);
    expect(interval.signedDistance(-3)).toBe(3);
  });

  test('signedDistance on semi-infinite intervals', () => {
    expectClose(Interval2.ray.signedDistance(5), -5);
    expectClose(Interval2.ray.signedDistance(-1), 1);
    expect(Interval2.infinite.signedDistance(100)).toBe(-Infinity);
  });

  test('intersect returns overlap or null', () => {
    expect(new Interval2(0, 5).intersect(new Interval2(3, 8))).toEqual(new Interval2(3, 5));
    expect(new Interval2(0, 1).intersect(new Interval2(2, 3))).toBeNull();
  });

  test('difference returns remaining parts', () => {
    expect(new Interval2(0, 10).difference(new Interval2(3, 7))).toEqual([new Interval2(0, 3), new Interval2(7, 10)]);
    expect(new Interval2(0, 10).difference(new Interval2(-1, 4))).toEqual([new Interval2(4, 10)]);
    expect(new Interval2(0, 10).difference(new Interval2(6, 12))).toEqual([new Interval2(0, 6)]);
    expect(new Interval2(0, 10).difference(new Interval2(-1, 12))).toEqual([]);
    expect(new Interval2(0, 10).difference(new Interval2(20, 30))).toEqual([new Interval2(0, 10)]);
  });

  test('merge fuses overlapping and touching intervals, sorted by min', () => {
    expect(Interval2.merge([])).toEqual([]);
    expect(Interval2.merge([new Interval2(2, 4), new Interval2(0, 1)])).toEqual([
      new Interval2(0, 1),
      new Interval2(2, 4),
    ]);
    expect(Interval2.merge([new Interval2(0, 3), new Interval2(2, 5)])).toEqual([new Interval2(0, 5)]);
    expect(Interval2.merge([new Interval2(0, 1), new Interval2(1, 2)])).toEqual([new Interval2(0, 2)]);
    // Swallowed interval must not shrink the span it sits in.
    expect(Interval2.merge([new Interval2(0, 9), new Interval2(3, 4)])).toEqual([new Interval2(0, 9)]);
  });

  test('merge with preferOut keeps merely touching intervals apart', () => {
    const touching = [new Interval2(0, 1), new Interval2(1, 2)];
    expect(Interval2.merge(touching, Epsilon.preferOut)).toEqual(touching);
    expect(Interval2.merge([new Interval2(0, 1), new Interval2(0.5, 2)], Epsilon.preferOut)).toEqual([
      new Interval2(0, 2),
    ]);
  });

  test('complement returns the gaps inside the domain', () => {
    expect(Interval2.complement([new Interval2(0, 0.25), new Interval2(0.75, 1)])).toEqual([new Interval2(0.25, 0.75)]);
    expect(Interval2.complement([new Interval2(0, 0.5), new Interval2(0.5, 1)])).toEqual([]);
    expect(Interval2.complement([])).toEqual([Interval2.unit]);
    // Coverage reaching past the domain is clipped to it.
    expect(Interval2.complement([new Interval2(-1, 0.4)])).toEqual([new Interval2(0.4, 1)]);
  });

  test('complement honours a custom domain and slack', () => {
    expect(Interval2.complement([new Interval2(4, 6)], new Interval2(2, 10))).toEqual([
      new Interval2(2, 4),
      new Interval2(6, 10),
    ]);
    // A slack wider than the seam bridges it: no gap is left.
    const split = [new Interval2(0, 0.45), new Interval2(0.55, 1)];
    expect(Interval2.complement(split)).toEqual([new Interval2(0.45, 0.55)]);
    expect(Interval2.complement(split, Interval2.unit, Epsilon.custom(0.2))).toEqual([]);
  });

  test('longest picks the widest interval above the slack', () => {
    expect(Interval2.longest([new Interval2(0, 1), new Interval2(3, 9), new Interval2(10, 12)])).toEqual(
      new Interval2(3, 9),
    );
    // Ties keep the first.
    expect(Interval2.longest([new Interval2(0, 2), new Interval2(5, 7)])).toEqual(new Interval2(0, 2));
    expect(Interval2.longest([])).toBeNull();
    expect(Interval2.longest([new Interval2(1, 1)])).toBeNull();
    expect(Interval2.longest([new Interval2(0, 0.5)], Epsilon.custom(1))).toBeNull();
  });

  test('empty is the identity of union and has no width (M6)', () => {
    const empty = Interval2.empty();
    expect(empty.isEmpty()).toBe(true);
    expect(empty.width()).toBe(0);
    expect(empty.isInfinite()).toBe(false);
    expect(new Interval2(0, 1).isEmpty()).toBe(false);

    expect(Interval2.union(new Interval2(0, 1), Interval2.empty())).toEqual(new Interval2(0, 1));
    expect(Interval2.union(Interval2.empty(), 3)).toEqual(new Interval2(3, 3));
    expect(Interval2.union(0, Infinity)).toEqual(new Interval2(0, Infinity));
    expect(new Interval2(0, 1).including(Interval2.infinite)).toEqual(Interval2.infinite);
    expect(new Interval2(0, 1).including(Interval2.ray)).toEqual(new Interval2(0, Infinity));
  });
});
