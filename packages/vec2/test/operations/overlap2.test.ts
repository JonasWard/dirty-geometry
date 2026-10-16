import { describe, expect, test } from 'bun:test';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Interval2 } from '../../src/bounds/interval2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Epsilon } from '../../src/core/epsilon';
import { Contains2 } from '../../src/operations/contains2';
import { Overlap2 } from '../../src/operations/overlap2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Hesse2 } from '../../src/geometry/primitives/hesse2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';

describe('Overlap2', () => {
  const square = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);
  const unitCircle = new Circle2(new Vec2(0, 0), 1);
  const xAxis = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));

  describe('points and curves', () => {
    test('coincident points overlap', () => {
      expect(Overlap2.overlaps(new Vec2(1, 2), new Vec2(1, 2))).toBe(true);
    });

    test('separated points do not overlap', () => {
      expect(Overlap2.overlaps(new Vec2(0, 0), new Vec2(3, 0))).toBe(false);
    });

    test('collinear segments overlap on shared interval', () => {
      const outer = new Line2(new Vec2(0, 0), new Vec2(10, 0));
      const inner = new Line2(new Vec2(2, 0), new Vec2(8, 0));
      expect(Overlap2.overlaps(outer, inner)).toBe(true);
      expect(Overlap2.overlaps(inner, outer)).toBe(true);
    });

    test('disjoint parallel segments do not overlap', () => {
      expect(
        Overlap2.overlaps(new Line2(new Vec2(0, 0), new Vec2(1, 0)), new Line2(new Vec2(0, 2), new Vec2(1, 2))),
      ).toBe(false);
    });

    test('crossing segments overlap', () => {
      expect(
        Overlap2.overlaps(new Line2(new Vec2(0, 0), new Vec2(2, 2)), new Line2(new Vec2(0, 2), new Vec2(2, 0))),
      ).toBe(true);
    });

    test('ray overlaps parallel sub-ray', () => {
      const ray = new Ray2(new Vec2(0, 0), new Vec2(1, 0));
      const shifted = new Ray2(new Vec2(3, 0), new Vec2(1, 0));
      expect(Overlap2.overlaps(ray, shifted)).toBe(true);
    });
  });

  describe('regions', () => {
    test('point inside polygon overlaps polygon', () => {
      expect(Overlap2.overlaps(square, new Vec2(5, 5))).toBe(true);
    });

    test('point outside polygon does not overlap', () => {
      expect(Overlap2.overlaps(square, new Vec2(15, 5))).toBe(false);
    });

    test('partially overlapping squares overlap without containment', () => {
      const other = new Polygon2([new Vec2(5, 5), new Vec2(15, 5), new Vec2(15, 15), new Vec2(5, 15)]);
      expect(Contains2.contains(square, other)).toBe(false);
      expect(Contains2.contains(other, square)).toBe(false);
      expect(Overlap2.overlaps(square, other)).toBe(true);
    });

    test('disjoint squares do not overlap', () => {
      const other = new Polygon2([new Vec2(20, 0), new Vec2(30, 0), new Vec2(30, 10), new Vec2(20, 10)]);
      expect(Overlap2.overlaps(square, other)).toBe(false);
    });

    test('segment crossing square overlaps but is not contained', () => {
      const segment = new Line2(new Vec2(-1, 5), new Vec2(11, 5));
      expect(Contains2.contains(square, segment)).toBe(false);
      expect(Overlap2.overlaps(square, segment)).toBe(true);
    });
  });

  describe('circles', () => {
    test('nested circles overlap', () => {
      expect(Overlap2.overlaps(unitCircle, new Circle2(new Vec2(0, 0), 0.5))).toBe(true);
    });

    test('separated circles do not overlap', () => {
      expect(Overlap2.overlaps(unitCircle, new Circle2(new Vec2(3, 0), 1))).toBe(false);
    });

    test('circle crossing square overlaps', () => {
      expect(Overlap2.overlaps(square, new Circle2(new Vec2(10, 5), 2))).toBe(true);
    });
  });

  describe('half-planes and boxes', () => {
    test('point in half-plane overlaps half-plane', () => {
      expect(Overlap2.overlaps(xAxis, new Vec2(1, -1))).toBe(true);
      expect(Overlap2.overlaps(xAxis, new Vec2(1, 1))).toBe(false);
    });

    test('ray in half-plane overlaps', () => {
      expect(Overlap2.overlaps(xAxis, new Ray2(new Vec2(0, -1), new Vec2(0, -1)))).toBe(true);
    });

    test('overlapping boxes overlap', () => {
      const a = Aabb2.fromIntervals(new Interval2(0, 5), new Interval2(0, 5));
      const b = Aabb2.fromIntervals(new Interval2(4, 8), new Interval2(4, 8));
      expect(Overlap2.overlaps(a, b)).toBe(true);
    });

    test('disjoint boxes do not overlap', () => {
      const a = Aabb2.fromIntervals(new Interval2(0, 1), new Interval2(0, 1));
      const b = Aabb2.fromIntervals(new Interval2(2, 3), new Interval2(2, 3));
      expect(Overlap2.overlaps(a, b)).toBe(false);
    });
  });

  describe('polylines', () => {
    test('polyline crossing square overlaps', () => {
      const pl = new Polyline2([new Vec2(-1, 5), new Vec2(11, 5)]);
      expect(Overlap2.overlaps(square, pl)).toBe(true);
    });

    test('polyline entirely outside square does not overlap', () => {
      const pl = new Polyline2([new Vec2(-3, -2), new Vec2(-1, -1)]);
      expect(Overlap2.overlaps(square, pl)).toBe(false);
    });
  });

  describe('boundary touching with preferOut', () => {
    const cornerSquare = new Polygon2([new Vec2(10, 10), new Vec2(20, 10), new Vec2(20, 20), new Vec2(10, 20)]);
    const tangentCircle = new Circle2(new Vec2(11, 5), 1);
    const meshOnEdge = new TriMesh2([new Vec2(10, 5), new Vec2(12, 5), new Vec2(11, 8)], [[0, 1, 2]]);

    function expectTouching(a: Parameters<typeof Overlap2.overlaps>[0], b: Parameters<typeof Overlap2.overlaps>[1]) {
      expect(Overlap2.overlaps(a, b, Epsilon.preferIn)).toBe(true);
      expect(Overlap2.overlaps(a, b, Epsilon.preferOut)).toBe(false);
    }

    test('point on segment endpoint', () => {
      expectTouching(new Vec2(1, 0), new Line2(new Vec2(0, 0), new Vec2(2, 0)));
    });

    test('segments meet at endpoint only', () => {
      expectTouching(new Line2(new Vec2(0, 0), new Vec2(1, 0)), new Line2(new Vec2(1, 0), new Vec2(2, 0)));
    });

    test('rays meet at endpoint only', () => {
      expectTouching(new Ray2(new Vec2(0, 0), new Vec2(1, 0)), new Ray2(new Vec2(2, 0), new Vec2(-1, 0)));
    });

    test('externally tangent circles', () => {
      expectTouching(unitCircle, new Circle2(new Vec2(2, 0), 1));
    });

    test('boxes share a corner only', () => {
      expectTouching(
        Aabb2.fromIntervals(new Interval2(0, 1), new Interval2(0, 1)),
        Aabb2.fromIntervals(new Interval2(1, 2), new Interval2(1, 2)),
      );
    });

    test('polygons share a corner only', () => {
      expectTouching(square, cornerSquare);
    });

    test('point on polygon boundary', () => {
      expectTouching(square, new Vec2(10, 5));
    });

    test('circle tangent to polygon', () => {
      expectTouching(square, tangentCircle);
    });

    test('point on half-plane boundary', () => {
      expectTouching(xAxis, new Vec2(1, 0));
    });

    test('polyline vertex on polygon boundary', () => {
      expectTouching(square, new Polyline2([new Vec2(12, 5), new Vec2(10, 5)]));
    });

    test('tri-mesh vertex on polygon boundary', () => {
      expectTouching(square, meshOnEdge);
    });
  });
});

describe('Overlap2 fixes', () => {
  const V = (x: number, y: number) => new Vec2(x, y);
  const xAxis = new InfiniteLine2(V(0, 0), V(1, 0)); // half-plane y <= 0
  const box = (x0: number, y0: number, x1: number, y1: number) => Aabb2.fromPoints(V(x0, y0), V(x1, y1));

  test('rays reach geometry beyond their definition segment (M14)', () => {
    const ray = new Ray2(V(0, 0), V(1, 0));
    expect(Overlap2.overlaps(ray, new Polyline2([V(5, -1), V(5, 1), V(6, 1)]))).toBe(true);
    expect(Overlap2.overlaps(new Ray2(V(0, 5), V(1, 0)), box(20, 0, 30, 10))).toBe(true);
    expect(Overlap2.overlaps(ray, new Polygon2([V(20, -1), V(30, -1), V(30, 1), V(20, 1)]))).toBe(true);
    expect(Overlap2.overlaps(new Ray2(V(0, 0), V(-1, 0)), new Polyline2([V(5, -1), V(5, 1)]))).toBe(false);
  });

  test('Hesse2 overlaps as the half-plane it describes (M15)', () => {
    const lower = new Hesse2(V(0, 1), 0);
    expect(Overlap2.overlaps(lower, new Line2(V(0, -1), V(0, 1)))).toBe(true);
    expect(Overlap2.overlaps(lower, V(0, -5))).toBe(true);
    expect(Overlap2.overlaps(lower, V(0, 5))).toBe(false);
    expect(Overlap2.overlaps(V(3, -2), lower)).toBe(true);
  });

  test('half-planes against circles, boxes and rays (M15)', () => {
    expect(Overlap2.overlaps(xAxis, new Circle2(V(0, -10), 1))).toBe(true);
    expect(Overlap2.overlaps(xAxis, new Circle2(V(0, 0.5), 1))).toBe(true);
    expect(Overlap2.overlaps(xAxis, new Circle2(V(0, 10), 1))).toBe(false);
    expect(Overlap2.overlaps(xAxis, box(0, -2, 1, -1))).toBe(true);
    expect(Overlap2.overlaps(xAxis, box(0, 1, 1, 2))).toBe(false);
    expect(Overlap2.overlaps(xAxis, new Ray2(V(0, 5), V(0, -1)))).toBe(true);
    expect(Overlap2.overlaps(xAxis, new Ray2(V(0, 5), V(0, 1)))).toBe(false);
    expect(Overlap2.overlaps(xAxis, new Ray2(V(0, 0), V(1, 0)), Epsilon.preferOut)).toBe(false);
  });

  test('a box inside a polygon overlaps it', () => {
    const square = new Polygon2([V(0, 0), V(10, 0), V(10, 10), V(0, 10)]);
    expect(Overlap2.overlaps(box(4, 4, 6, 6), square)).toBe(true);
    expect(Overlap2.overlaps(square, box(4, 4, 6, 6))).toBe(true);
  });

  test('the broad phase applies the slack once', () => {
    expect(Overlap2.overlaps(box(0, 0, 1, 1), box(1 + 1.5e-6, 0, 2, 1))).toBe(false);
    expect(Overlap2.overlaps(box(0, 0, 1, 1), box(1 + 0.5e-6, 0, 2, 1))).toBe(true);
  });
});

