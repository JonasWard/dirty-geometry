import { describe, expect, test } from 'bun:test';
import { mulberry32 } from '../../examples/random';
import { Vec2 } from '../../src/core/vec2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Boolean2 } from '../../src/operations/boolean2';
import { ConstrainedDelaunay } from '../../src/operations/constrained-delaunay';
import { ConvexDecomposition2 } from '../../src/operations/convex-decomposition2';

const loop = (...xy: number[]) =>
  new Polygon2(Array.from({ length: xy.length / 2 }, (_, i) => new Vec2(xy[2 * i]!, xy[2 * i + 1]!)));

const square = (x: number, y: number, size: number) => loop(x, y, x + size, y, x + size, y + size, x, y + size);

const lShape = loop(0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2);

function randomStar(random: () => number, count: number): Polygon2 {
  return new Polygon2(
    Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      const r = 0.5 + random() * 1.5;
      return new Vec2(r * Math.cos(angle), r * Math.sin(angle));
    }),
  );
}

const totalArea = (pieces: readonly Polygon2[]) => pieces.reduce((sum, piece) => sum + piece.signedArea(), 0);

/** Pieces that tile a region: all convex and counter-clockwise, adding up to the region, not overlapping. */
function expectTiling(pieces: readonly Polygon2[], area: number) {
  expect(pieces.every((piece) => piece.isConvex() && piece.signedArea() > 0)).toBe(true);
  expect(totalArea(pieces)).toBeCloseTo(area, 9);
  const union = Boolean2.union(pieces).polygons;
  expect(totalArea(union)).toBeCloseTo(area, 9);
}

describe('ConvexDecomposition2.fromMesh', () => {
  test('merges a triangulated convex polygon into one piece', () => {
    const hexagon = Polygon2.fromCircle2(new Circle2(Vec2.origin(), 1), 6);
    const mesh = Boolean2.union([hexagon], { mesh: true }).triMesh!;
    expect(mesh.triangleCount).toBe(4);
    const pieces = ConvexDecomposition2.fromMesh(mesh);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.area()).toBeCloseTo(hexagon.area(), 12);
  });

  test('keeps every piece convex and the area unchanged', () => {
    const random = mulberry32(5);
    for (let run = 0; run < 20; run++) {
      const star = randomStar(random, 30);
      const pieces = ConvexDecomposition2.fromMesh(Boolean2.union([star], { mesh: true }).triMesh!);
      expectTiling(pieces, star.area());
      expect(pieces.length).toBeLessThan(30 - 2);
    }
  });

  test('a single triangle is one piece', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1)]);
    expect(ConvexDecomposition2.fromMesh(mesh)).toHaveLength(1);
  });
});

describe('ConvexDecomposition2.decompose', () => {
  test('an L becomes two pieces', () => {
    const pieces = ConvexDecomposition2.decompose([lShape]);
    expect(pieces).toHaveLength(2);
    expectTiling(pieces, 3);
  });

  test('no piece covers a hole', () => {
    const hole = square(4, 4, 2);
    const pieces = ConvexDecomposition2.decompose([square(0, 0, 10), hole.inverse()]);
    expectTiling(pieces, 100 - 4);
    for (const piece of pieces) expect(piece.containsPoint(new Vec2(5, 5))).toBe(false);
  });

  test('a clockwise convex loop comes back as one counter-clockwise piece', () => {
    const pieces = ConvexDecomposition2.decompose([square(0, 0, 2).inverse()]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.signedArea()).toBe(4);
  });

  test('overlapping convex loops come back as a tiling, not as the inputs', () => {
    const pieces = ConvexDecomposition2.decompose([square(0, 0, 2), square(1, 1, 2)]);
    expectTiling(pieces, 7);
  });

  test('no loops, no pieces', () => {
    expect(ConvexDecomposition2.decompose([])).toHaveLength(0);
  });
});
