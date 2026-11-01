import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../../src/core/vec2';
import {
  circleCircle,
  lineCircle,
  lineLine,
  segmentIntersections,
} from '../../../src/geometry/curves/arc-intersections';
import { Arc2 } from '../../../src/geometry/primitives/arc2';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { expectVec2Close } from '../../testHelpers';

const sortX = (points: Vec2[]) => [...points].sort((a, b) => a.x - b.x || a.y - b.y);

describe('supporting-curve intersections', () => {
  test('lineLine', () => {
    expectVec2Close(lineLine(new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, -1), new Vec2(0, 1))!, new Vec2(2, 0));
    expect(lineLine(new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2(2, 0))).toBeNull();
  });

  test('lineCircle: two, tangent, none', () => {
    const two = sortX(lineCircle(new Vec2(-5, 0), new Vec2(1, 0), new Vec2(0, 0), 1));
    expectVec2Close(two[0]!, new Vec2(-1, 0));
    expectVec2Close(two[1]!, new Vec2(1, 0));
    expect(lineCircle(new Vec2(-5, 1), new Vec2(1, 0), new Vec2(0, 0), 1).length).toBe(1);
    expect(lineCircle(new Vec2(-5, 2), new Vec2(1, 0), new Vec2(0, 0), 1).length).toBe(0);
  });

  test('circleCircle: two, tangent, apart, nested, concentric', () => {
    const two = sortX(circleCircle(new Vec2(0, 0), 1, new Vec2(1, 0), 1));
    expectVec2Close(two[0]!, new Vec2(0.5, -Math.sqrt(3) / 2));
    expect(circleCircle(new Vec2(0, 0), 1, new Vec2(2, 0), 1).length).toBe(1);
    expect(circleCircle(new Vec2(0, 0), 1, new Vec2(3, 0), 1).length).toBe(0);
    expect(circleCircle(new Vec2(0, 0), 3, new Vec2(0.5, 0), 1).length).toBe(0);
    expect(circleCircle(new Vec2(0, 0), 1, new Vec2(0, 0), 2).length).toBe(0);
  });
});

describe('segmentIntersections', () => {
  test('filters points outside the sweep', () => {
    // Sagitta −1 from (−1, 0) to (1, 0) bulges right of travel: the lower half of the unit circle.
    const lower = new Arc2(new Vec2(-1, 0), new Vec2(1, 0), -1);
    const vertical = new Line2(new Vec2(0, -5), new Vec2(0, 5));
    const points = segmentIntersections(lower, vertical);
    expect(points.length).toBe(1);
    expectVec2Close(points[0]!, new Vec2(0, -1));
  });

  test('line segments that miss and that cross', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(2, 2));
    expect(segmentIntersections(a, new Line2(new Vec2(0, 2), new Vec2(2, 0))).length).toBe(1);
    expect(segmentIntersections(a, new Line2(new Vec2(3, 0), new Vec2(4, -1))).length).toBe(0);
  });

  test('overlapping collinear segments give the overlap ends', () => {
    const points = sortX(
      segmentIntersections(new Line2(new Vec2(0, 0), new Vec2(2, 0)), new Line2(new Vec2(1, 0), new Vec2(3, 0))),
    );
    expect(points.length).toBe(2);
    expectVec2Close(points[0]!, new Vec2(1, 0));
    expectVec2Close(points[1]!, new Vec2(2, 0));
  });

  test('two arcs on different circles', () => {
    const a = new Arc2(new Vec2(-1, 0), new Vec2(1, 0), 1); // the unit circle's upper half, clockwise
    const b = new Arc2(new Vec2(0, 0), new Vec2(2, 0), 1); // the upper half of the circle around (1, 0)
    const points = segmentIntersections(a, b);
    expect(points.length).toBe(1);
    expectVec2Close(points[0]!, new Vec2(0.5, Math.sqrt(3) / 2));
  });

  test('arcs on the same circle give the overlap ends', () => {
    const upper = new Arc2(new Vec2(-1, 0), new Vec2(1, 0), 1);
    const right = new Arc2(new Vec2(0, 1), new Vec2(0, -1), 1); // clockwise over the right side
    const points = sortX(segmentIntersections(upper, right));
    expect(points.length).toBe(2);
    expectVec2Close(points[0]!, new Vec2(0, 1));
    expectVec2Close(points[1]!, new Vec2(1, 0));
  });
});
