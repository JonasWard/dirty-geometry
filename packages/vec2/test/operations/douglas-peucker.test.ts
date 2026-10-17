import { describe, expect, test } from 'bun:test';
import { Angle } from '../../src/core/angle';
import { Epsilon } from '../../src/core/epsilon';
import { Vec2 } from '../../src/core/vec2';
import { DouglasPeucker } from '../../src/operations/douglas-peucker';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';

describe('DouglasPeucker.simplifyVertices', () => {
  test('removes collinear middle points on an open polyline', () => {
    const simplified = DouglasPeucker.simplifyVertices(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0)],
      DouglasPeucker.defaults,
      false,
    );

    expect(simplified).toHaveLength(2);
    expect(simplified[0]!.x).toBe(0);
    expect(simplified[1]!.x).toBe(3);
  });

  test('keeps vertices outside distance tolerance', () => {
    const simplified = DouglasPeucker.simplifyVertices(
      [new Vec2(0, 0), new Vec2(1, 1), new Vec2(2, 0)],
      DouglasPeucker.defaults,
      false,
    );

    expect(simplified.length).toBeGreaterThanOrEqual(3);
  });

  test('preserves at least three vertices on closed polygons', () => {
    const simplified = DouglasPeucker.simplifyVertices(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)],
      DouglasPeucker.defaults,
      true,
    );

    expect(simplified.length).toBeGreaterThanOrEqual(3);
  });
});

describe('DouglasPeucker.simplify on Polyline2', () => {
  test('returns a simplified polyline', () => {
    const polyline = new Polyline2([new Vec2(0, 0), new Vec2(1, 0.001), new Vec2(2, 0)]);

    expect(DouglasPeucker.simplify(polyline, DouglasPeucker.defaults).vertices.length).toBeLessThan(
      polyline.vertices.length,
    );
  });
});

describe('DouglasPeucker.simplify on Polygon2', () => {
  test('returns a simplified polygon', () => {
    const polygon = new Polygon2([new Vec2(0, 0), new Vec2(1, 0.001), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)]);

    const simplified = DouglasPeucker.simplify(polygon, {
      distance: Epsilon.custom(0.01),
      angle: Angle.fromDegrees(2),
    });

    expect(simplified.vertices.length).toBeLessThanOrEqual(polygon.vertices.length);
    expect(simplified.vertices.length).toBeGreaterThanOrEqual(3);
  });
});

describe('DouglasPeucker.simplifyVertices on closed loops (M19)', () => {
  test('a collinear start vertex is removed like any other', () => {
    const simplified = DouglasPeucker.simplifyVertices(
      [new Vec2(5, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10), new Vec2(0, 0)],
      DouglasPeucker.defaults,
      true,
    );
    expect(simplified).toHaveLength(4);
    expect(simplified.map((v) => `${v.x},${v.y}`).sort()).toEqual(['0,0', '0,10', '10,0', '10,10']);
  });

  test('handles long loops without deep recursion', () => {
    const circle = Array.from({ length: 50_000 }, (_, i) => {
      const t = (i / 50_000) * Math.PI * 2;
      return new Vec2(Math.cos(t) * 1000, Math.sin(t) * 1000);
    });
    expect(DouglasPeucker.simplifyVertices(circle, DouglasPeucker.defaults, true).length).toBeGreaterThan(3);
  });
});
