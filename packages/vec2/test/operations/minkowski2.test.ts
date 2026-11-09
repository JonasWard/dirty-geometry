import { describe, expect, test } from 'bun:test';
import { mulberry32 } from '../../examples/random';
import { Vec2 } from '../../src/core/vec2';
import type { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import type { Boolean2Result } from '../../src/operations/boolean2';
import { Minkowski2 } from '../../src/operations/minkowski2';

const loop = (...xy: number[]) =>
  new Polygon2(Array.from({ length: xy.length / 2 }, (_, i) => new Vec2(xy[2 * i]!, xy[2 * i + 1]!)));

const square = (x: number, y: number, size: number) => loop(x, y, x + size, y, x + size, y + size, x, y + size);

/** A random convex polygon: the hull of random points around `center`. */
function randomConvex(random: () => number, center: Vec2, count: number): Polygon2 {
  for (;;) {
    const points = Array.from({ length: count }, () => center.add(new Vec2(random() * 4 - 2, random() * 4 - 2)));
    const hull = Polygon2.convexHull(points);
    if (hull) return hull;
  }
}

/** Vertices as sorted coordinate pairs, rounded, for comparing loops regardless of start vertex. */
const vertexSet = (polygon: Polygon2) => polygon.vertices.map((v) => `${v.x.toFixed(9)},${v.y.toFixed(9)}`).sort();

describe('Minkowski2.convexSum', () => {
  test('matches the hull of the pairwise sums', () => {
    const random = mulberry32(11);
    for (let run = 0; run < 200; run++) {
      const a = randomConvex(random, new Vec2(random() * 10, random() * 10), 3 + Math.floor(random() * 10));
      const b = randomConvex(random, new Vec2(random() * 10, random() * 10), 3 + Math.floor(random() * 10));
      const sum = Minkowski2.convexSum(a, b);
      const oracle = Minkowski2.sumPoints(a.vertices, b.vertices)!;
      expect(sum.signedArea()).toBeGreaterThan(0);
      expect(sum.isConvex()).toBe(true);
      expect(vertexSet(sum)).toEqual(vertexSet(oracle));
      expect(sum.length()).toBeCloseTo(a.length() + b.length(), 9);
    }
  });

  test('merges parallel edges', () => {
    const sum = Minkowski2.convexSum(square(0, 0, 1), square(5, 5, 2));
    expect(sum.vertices).toHaveLength(4);
    expect(sum.area()).toBe(9);
    expect(vertexSet(sum)).toEqual(vertexSet(square(5, 5, 3)));
  });

  test('a triangle plus its reflection is a hexagon', () => {
    const triangle = loop(0, 0, 3, 0, 0, 3);
    const reflected = new Polygon2(triangle.vertices.map((v) => v.negate()));
    const sum = Minkowski2.convexSum(triangle, reflected);
    expect(sum.vertices).toHaveLength(6);
    expect(sum.containsPoint(Vec2.origin())).toBe(true);
  });

  test('does not depend on orientation or start vertex', () => {
    const a = loop(0, 0, 4, 1, 2, 3);
    const b = square(1, 1, 1);
    const expected = vertexSet(Minkowski2.convexSum(a, b));
    expect(vertexSet(Minkowski2.convexSum(a.inverse(), b))).toEqual(expected);
    expect(vertexSet(Minkowski2.convexSum(loop(2, 3, 0, 0, 4, 1), b.inverse()))).toEqual(expected);
  });

  test('allows straight vertices in the inputs', () => {
    const sum = Minkowski2.convexSum(loop(0, 0, 1, 0, 2, 0, 2, 2, 0, 2), square(0, 0, 1));
    expect(sum.vertices).toHaveLength(4);
    expect(sum.area()).toBe(9);
  });

  test('throws for a concave polygon', () => {
    const concave = loop(0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2);
    expect(() => Minkowski2.convexSum(concave, square(0, 0, 1))).toThrow();
  });
});

describe('Minkowski2.sumPoints', () => {
  test('is null when the sums lie on one line', () => {
    expect(Minkowski2.sumPoints([new Vec2(0, 0), new Vec2(1, 0)], [new Vec2(0, 0), new Vec2(2, 0)])).toBeNull();
  });
});

/** The L of three unit squares: area 3, perimeter 8, one reflex corner. */
const lShape = loop(0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2);

const regionArea = (result: Boolean2Result) =>
  (result.regions ?? []).reduce((sum, region) => sum + region.signedArea(), 0) +
  result.polygons.reduce((sum, polygon) => sum + polygon.signedArea(), 0);

const arcSweep = (region: ArcPolygon2) =>
  region.segments().reduce((sum, segment) => sum + ('sweep' in segment ? Math.abs(segment.sweep()) : 0), 0);

describe('Minkowski2.convexSumDisc', () => {
  test('a square grows by edge strips and quarter circles', () => {
    const r = 0.75;
    const grown = Minkowski2.convexSumDisc(square(0, 0, 2), r);
    expect(grown.signedArea()).toBeCloseTo(4 + 8 * r + Math.PI * r * r, 9);
    expect(grown.sagittas.every((s) => s <= 0)).toBe(true);
    expect(arcSweep(grown)).toBeCloseTo(2 * Math.PI, 9);
  });

  test('every boundary point is at distance r from the polygon', () => {
    const random = mulberry32(3);
    const polygon = randomConvex(random, Vec2.origin(), 9);
    const grown = Minkowski2.convexSumDisc(polygon.inverse(), 0.5);
    for (let k = 0; k < 100; k++) {
      const point = grown.evaluateAtLength((grown.length() * k) / 100);
      expect(polygon.distanceToPoint(point)).toBeCloseTo(0.5, 9);
    }
  });

  test('radius 0 keeps the polygon, a negative radius throws', () => {
    expect(Minkowski2.convexSumDisc(square(0, 0, 1), 0).signedArea()).toBe(1);
    expect(() => Minkowski2.convexSumDisc(square(0, 0, 1), -1)).toThrow();
  });
});

describe('Minkowski2.sumDisc', () => {
  test('a convex loop is built directly', () => {
    const result = Minkowski2.sumDisc([square(0, 0, 2)], 0.5);
    expect(result.regions).toHaveLength(1);
    expect(regionArea(result)).toBeCloseTo(4 + 4 + Math.PI / 4, 9);
  });

  test('an L loses a square of r² at its reflex corner', () => {
    const r = 0.25;
    const result = Minkowski2.sumDisc([lShape], r);
    expect(result.regions).toHaveLength(1);
    expect(regionArea(result)).toBeCloseTo(3 + 8 * r + ((5 * Math.PI) / 4) * r * r - r * r, 9);
  });

  test('a hole shrinks, then closes once r passes half its width', () => {
    const outer = square(0, 0, 10);
    const hole = square(4, 4, 2).inverse();
    const small = Minkowski2.sumDisc([outer, hole], 0.5);
    expect(small.regions).toHaveLength(2);
    expect(regionArea(small)).toBeCloseTo(100 + 40 * 0.5 + Math.PI * 0.25 - 1, 9);
    const large = Minkowski2.sumDisc([outer, hole], 1.5);
    expect(large.regions).toHaveLength(1);
    expect(regionArea(large)).toBeCloseTo(100 + 40 * 1.5 + Math.PI * 2.25, 9);
  });

  test('empty input and radius 0', () => {
    expect(regionArea(Minkowski2.sumDisc([], 1))).toBe(0);
    expect(regionArea(Minkowski2.sumDisc([lShape], 0))).toBeCloseTo(3, 12);
  });
});
