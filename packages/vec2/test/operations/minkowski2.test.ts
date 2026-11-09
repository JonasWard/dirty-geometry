import { describe, expect, test } from 'bun:test';
import { mulberry32 } from '../../examples/random';
import { Vec2 } from '../../src/core/vec2';
import type { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import type { Boolean2Result } from '../../src/operations/boolean2';
import { Boolean2 } from '../../src/operations/boolean2';
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

/** A star-shaped loop of `count` vertices at random radii around `center`, counter-clockwise. */
function randomStar(random: () => number, center: Vec2, count: number): Polygon2 {
  return new Polygon2(
    Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      const r = 0.5 + random() * 1.5;
      return center.add(new Vec2(r * Math.cos(angle), r * Math.sin(angle)));
    }),
  );
}

/** The sum by brute force: every triangle of `a` plus every triangle of `b`, united. */
function bruteForceSum(a: readonly Polygon2[], b: readonly Polygon2[]): number {
  const triangles = (loops: readonly Polygon2[]) => {
    const mesh = Boolean2.union(loops, { mesh: true }).triMesh!;
    return mesh.triangles.map(([i, j, k]) => [mesh.vertices[i]!, mesh.vertices[j]!, mesh.vertices[k]!]);
  };
  const sums = triangles(a).flatMap((p) => triangles(b).map((q) => Minkowski2.sumPoints(p, q)!));
  return regionArea(Boolean2.union(sums));
}

describe('Minkowski2.sum', () => {
  test('an L plus a unit square', () => {
    const result = Minkowski2.sum([lShape], [square(0, 0, 1)]);
    expect(result.polygons).toHaveLength(1);
    expect(regionArea(result)).toBeCloseTo(8, 9);
  });

  test('two convex loops take the fast path', () => {
    const result = Minkowski2.sum([square(0, 0, 1)], [loop(0, 0, 1, 0, 0, 1)]);
    expect(result.polygons).toHaveLength(1);
    expect(result.polygons[0]!.vertices).toHaveLength(5);
  });

  test('matches the brute-force sum of triangles for random stars', () => {
    const random = mulberry32(17);
    for (let run = 0; run < 10; run++) {
      const a = [randomStar(random, Vec2.origin(), 12)];
      const b = [randomStar(random, new Vec2(3, 1), 7)];
      const area = regionArea(Minkowski2.sum(a, b));
      expect(area / bruteForceSum(a, b)).toBeCloseTo(1, 9);
      for (const p of a[0]!.vertices) {
        for (const q of b[0]!.vertices) {
          expect(Polygon2.isPointInside(Minkowski2.sum(a, b).polygons, p.add(q))).toBe(true);
        }
      }
    }
  });

  test('a hole shrinks by the other shape', () => {
    const shape = [square(0, 0, 10), square(3, 3, 4).inverse()];
    const result = Minkowski2.sum(shape, [square(0, 0, 1)]);
    expect(result.polygons).toHaveLength(2);
    expect(regionArea(result)).toBeCloseTo(121 - 9, 9);
  });

  test('disjoint loops stay apart', () => {
    const result = Minkowski2.sum([square(0, 0, 1), square(10, 0, 1)], [lShape]);
    expect(result.polygons).toHaveLength(2);
    expect(regionArea(result)).toBeCloseTo(2 * 8, 9);
  });

  test('touching pieces leave no gaps', () => {
    const comb = loop(0, 0, 5, 0, 5, 3, 4, 3, 4, 1, 3, 1, 3, 3, 2, 3, 2, 1, 1, 1, 1, 3, 0, 3);
    const thin = loop(0, 0, 0.5, 0, 0.5, 0.01);
    const result = Minkowski2.sum([comb], [thin]);
    expect(regionArea(result) / bruteForceSum([comb], [thin])).toBeCloseTo(1, 9);
    expect(result.polygons).toHaveLength(1);
  });

  test('throws past maxPieces, empty input gives an empty result', () => {
    const star = randomStar(mulberry32(1), Vec2.origin(), 40);
    expect(() => Minkowski2.sum([star], [star], { maxPieces: 10 })).toThrow();
    expect(Minkowski2.sum([], [square(0, 0, 1)]).polygons).toHaveLength(0);
  });
});

describe('Minkowski2.sumNegated', () => {
  test('a shape minus itself is centrally symmetric about the origin', () => {
    const result = Minkowski2.sumNegated([lShape], [lShape]);
    expect(Polygon2.isPointInside(result.polygons, Vec2.origin())).toBe(true);
    const random = mulberry32(9);
    for (let k = 0; k < 200; k++) {
      const point = new Vec2(random() * 6 - 3, random() * 6 - 3);
      expect(Polygon2.isPointInside(result.polygons, point)).toBe(
        Polygon2.isPointInside(result.polygons, point.negate()),
      );
    }
  });

  test('two squares touch when their offset is in the sum', () => {
    const result = Minkowski2.sumNegated([square(0, 0, 2)], [square(0, 0, 1)]);
    expect(regionArea(result)).toBeCloseTo(9, 9);
    expect(Polygon2.isPointInside(result.polygons, new Vec2(-0.9, 1.9))).toBe(true);
    expect(Polygon2.isPointInside(result.polygons, new Vec2(2.1, 0))).toBe(false);
  });
});

describe('Minkowski2.erode', () => {
  const vertexBounds = (result: Boolean2Result) => {
    const xs = result.polygons.flatMap((p) => p.vertices.map((v) => v.x));
    const ys = result.polygons.flatMap((p) => p.vertices.map((v) => v.y));
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };

  test('a centred square shrinks a square by its half-width', () => {
    const result = Minkowski2.erode([square(0, 0, 10)], [square(-1, -1, 2)]);
    expect(regionArea(result)).toBeCloseTo(64, 9);
    expect(vertexBounds(result).map((v) => +v.toFixed(9))).toEqual([1, 1, 9, 9]);
  });

  test('an off-origin shape moves the result', () => {
    const result = Minkowski2.erode([square(0, 0, 10)], [square(2, 2, 2)]);
    expect(regionArea(result)).toBeCloseTo(64, 9);
    expect(vertexBounds(result).map((v) => +v.toFixed(9))).toEqual([-2, -2, 6, 6]);
  });

  test('a concave shape and a hole', () => {
    const result = Minkowski2.erode([lShape], [square(-0.25, -0.25, 0.5)]);
    expect(regionArea(result)).toBeCloseTo(1.5 * 0.5 * 2 - 0.5 * 0.5, 9);
    const holed = Minkowski2.erode([square(0, 0, 10), square(4, 4, 2).inverse()], [square(-1, -1, 2)]);
    expect(regionArea(holed)).toBeCloseTo(64 - 16, 9);
  });

  test('opening (erode, then sum) stays inside the shape', () => {
    const b = [loop(-0.2, -0.2, 0.2, -0.2, 0, 0.3)];
    const opened = Minkowski2.sum(Minkowski2.erode([lShape], b).polygons, b);
    expect(regionArea(opened)).toBeLessThanOrEqual(3 + 1e-9);
    expect(Boolean2.subtract(opened.polygons, [lShape]).polygons.reduce((s, p) => s + p.area(), 0)).toBeLessThan(1e-9);
  });

  test('a shape too big to fit leaves nothing', () => {
    expect(Minkowski2.erode([square(0, 0, 1)], [square(0, 0, 2)]).polygons).toHaveLength(0);
    expect(Minkowski2.erode([], [square(0, 0, 2)]).polygons).toHaveLength(0);
  });
});
