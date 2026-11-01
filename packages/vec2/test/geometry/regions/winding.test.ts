import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../../src/core/epsilon';
import { Vec2 } from '../../../src/core/vec2';
import { Polygon2 } from '../../../src/geometry/regions/polygon2';
import { insideByRule, windingNumber, WindingIndex } from '../../../src/geometry/regions/winding';
import { mulberry32 } from '../../../examples/random';

/** The rule `Polygon2.windingNumber` used before it moved to the shared module. */
function referenceWinding(vertices: readonly Vec2[], point: Vec2): number {
  let winding = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    if (a.y <= point.y) {
      if (b.y > point.y && Vec2.orient(a, b, point) > 0) winding++;
    } else if (b.y <= point.y && Vec2.orient(a, b, point) < 0) winding--;
  }
  return winding;
}

/** The even-odd crossing count `Polygon2.isPointInside` used before (x-intercept test). */
function referenceEvenOdd(polygons: readonly Polygon2[], point: Vec2): boolean {
  let crossings = 0;
  for (const { vertices } of polygons) {
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]!;
      const b = vertices[(i + 1) % vertices.length]!;
      if ((a.y <= point.y && b.y > point.y) || (b.y <= point.y && a.y > point.y)) {
        const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
        if (point.x < x) crossings++;
      }
    }
  }
  return crossings % 2 === 1;
}

/** A random, possibly self-intersecting polygon; `snap` puts vertices on a coarse lattice (repeated y values). */
function randomPolygon(rng: () => number, snap: boolean): Polygon2 {
  const count = 3 + Math.floor(rng() * 12);
  const coordinate = () => (snap ? Math.round(rng() * 8) : rng() * 10);
  return new Polygon2(Array.from({ length: count }, () => new Vec2(coordinate(), coordinate())));
}

const square = (x: number, y: number, size: number) =>
  new Polygon2([new Vec2(x, y), new Vec2(x + size, y), new Vec2(x + size, y + size), new Vec2(x, y + size)]);

describe('winding number', () => {
  test('matches the previous Polygon2.windingNumber on random polygons and points', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const polygon = randomPolygon(rng, seed % 2 === 0);
      for (let k = 0; k < 20; k++) {
        const point = new Vec2(rng() * 12 - 1, rng() * 12 - 1);
        expect(windingNumber([polygon], point)).toBe(referenceWinding(polygon.vertices, point));
        expect(polygon.windingNumber(point)).toBe(referenceWinding(polygon.vertices, point));
      }
    }
  });

  test('WindingIndex matches windingNumber, including points outside the y-range and flat edges', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const polygons = [randomPolygon(rng, true), randomPolygon(rng, false)];
      const index = new WindingIndex(polygons);
      for (let k = 0; k < 30; k++) {
        const point = new Vec2(rng() * 14 - 2, rng() * 14 - 2);
        expect(index.winding(point)).toBe(windingNumber(polygons, point));
      }
      // Lattice points lie at exactly the y of flat (horizontal) edges.
      for (let y = -1; y <= 9; y++) {
        const point = new Vec2(rng() * 8, y);
        expect(index.winding(point)).toBe(windingNumber(polygons, point));
      }
    }
    expect(new WindingIndex([]).winding(new Vec2(0, 0))).toBe(0);
  });

  test('even-odd matches the previous isPointInside away from the boundary', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const polygons = [randomPolygon(rng, false), randomPolygon(rng, false)];
      for (let k = 0; k < 20; k++) {
        const point = new Vec2(rng() * 12 - 1, rng() * 12 - 1);
        if (polygons.some((polygon) => polygon.distanceToPoint(point) <= Epsilon.value)) continue;
        expect(Polygon2.isPointInside(polygons, point)).toBe(referenceEvenOdd(polygons, point));
      }
    }
  });

  test('the rules differ where two counter-clockwise loops overlap', () => {
    const loops = [square(0, 0, 2), square(1, 1, 2)];
    const overlap = new Vec2(1.5, 1.5);
    const single = new Vec2(0.5, 0.5);

    expect(windingNumber(loops, overlap)).toBe(2);
    expect(insideByRule(2, 'nonZero')).toBe(true);
    expect(insideByRule(2, 'evenOdd')).toBe(false);
    expect(Polygon2.isPointInside(loops, overlap)).toBe(false);
    expect(Polygon2.isPointInside(loops, overlap, Epsilon.preferIn, 'nonZero')).toBe(true);
    expect(Polygon2.isPointInside(loops, single, Epsilon.preferIn, 'nonZero')).toBe(true);
    expect(new WindingIndex(loops).contains(overlap, 'evenOdd')).toBe(false);
  });
});
