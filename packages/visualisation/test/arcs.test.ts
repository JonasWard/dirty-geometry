import { describe, expect, test } from 'bun:test';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { ArcPolyline2 } from '@dirty-geometry/vec2/geometry/curves/arc-polyline2';
import { Arc2 } from '@dirty-geometry/vec2/geometry/primitives/arc2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { ArcPolygon2 } from '@dirty-geometry/vec2/geometry/regions/arc-polygon2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { createContainerFill, createGeometryOutline, geometryFramePoints } from '../src/geometry';
import { arcChainDisplayPoints } from '../src/geometry/display/shared/arc';

const V = (x: number, y: number) => new Vec2(x, y);
const identity = { fit: (point: Vec2) => point, offset: V(0, 0) };

describe('arc display points', () => {
  test('a half circle is sampled on its circle, ending at its end point', () => {
    const half = new Arc2(V(-1, 0), V(1, 0), 1);
    const points = arcChainDisplayPoints([half], false);
    expect(points.length).toBe(25); // 24 steps for half a turn, plus the end
    for (const point of points) expect(point.distance(V(0, 0))).toBeCloseTo(1, 9);
    expect(points[points.length - 1]!.distance(V(1, 0))).toBe(0);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(1, 9);
  });

  test('straight segments add only their ends; closed chains end on the first point', () => {
    const square = ArcPolygon2.fromSegments([
      new Line2(V(0, 0), V(1, 0)),
      new Line2(V(1, 0), V(1, 1)),
      new Line2(V(1, 1), V(0, 1)),
      new Line2(V(0, 1), V(0, 0)),
    ]);
    const points = arcChainDisplayPoints(square.segments(), true);
    expect(points.length).toBe(5);
    expect(points[4]!.distance(points[0]!)).toBe(0);
    const open = new ArcPolyline2([V(0, 0), V(2, 0), V(3, 1)], [0, -0.3]);
    const openPoints = arcChainDisplayPoints(open.segments(), false);
    expect(openPoints[openPoints.length - 1]!.distance(V(3, 1))).toBe(0);
  });
});

describe('arc outlines, fills and frames', () => {
  const arc = new Arc2(V(0, 0), V(2, 0), 3); // a major arc bulging up to y = 3
  const path = new ArcPolyline2([V(0, 0), V(2, 0), V(4, 0)], [1, -1]);
  const region = ArcPolygon2.fromCircle2(new Circle2(V(0, 0), 1));

  test('every arc kind gets a polyline outline', () => {
    for (const geometry of [arc, path, region]) {
      const outline = createGeometryOutline(geometry, identity);
      expect(outline?.threeKind).toBe('polyline');
    }
  });

  test('an ArcPolygon2 gets a shape fill of about its area', () => {
    const fill = createContainerFill(region, identity);
    expect(fill?.threeKind).toBe('shape');
    fill?.geometry.computeBoundingBox();
    expect(fill?.geometry.boundingBox?.max.x).toBeCloseTo(1, 6);
  });

  test("a major arc's frame covers its bulge", () => {
    const points = geometryFramePoints(arc);
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(2.9);
    expect(Math.min(...points.map((p) => p.x))).toBeLessThan(0);
  });
});
