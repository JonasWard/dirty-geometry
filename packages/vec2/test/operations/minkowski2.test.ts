import { describe, expect, test } from 'bun:test';
import { mulberry32 } from '../../examples/random';
import { Vec2 } from '../../src/core/vec2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
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
