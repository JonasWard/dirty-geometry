import { describe, expect, test } from 'bun:test';
import { Mat3 } from '../../../src/core/mat3';
import { Vec2 } from '../../../src/core/vec2';
import { ArcPolyline2 } from '../../../src/geometry/curves/arc-polyline2';
import { Polyline2 } from '../../../src/geometry/curves/polyline2';
import { Arc2 } from '../../../src/geometry/primitives/arc2';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { expectClose, expectVec2Close } from '../../testHelpers';

const quarter = 1 - Math.cos(Math.PI / 4); // |sagitta| of a quarter circle of radius 1
/** Straight (0,0) → (2,0), then a counter-clockwise quarter circle (centre (2,1)) to (3,1): a smooth join. */
const smooth = new ArcPolyline2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(3, 1)], [0, -quarter]);
/** An L turning left at (2,0). */
const corner = new ArcPolyline2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2)], [0, 0]);

function expectVertices(path: { vertices: readonly Vec2[] }, expected: Vec2[]): void {
  expect(path.vertices.length).toBe(expected.length);
  expected.forEach((v, i) => expectVec2Close(path.vertices[i]!, v, 1e-9, `vertex ${i}`));
}

describe('ArcPolyline2 construction', () => {
  test('counts, chords and snapping', () => {
    expect(() => new ArcPolyline2([new Vec2(0, 0)], [])).toThrow(/at least 2/);
    expect(() => new ArcPolyline2([new Vec2(0, 0), new Vec2(1, 0)], [])).toThrow(/one sagitta per segment/);
    expect(() => new ArcPolyline2([new Vec2(0, 0), new Vec2(0, 1e-7)], [0])).toThrow(/no length/);
    const snapped = new ArcPolyline2([new Vec2(0, 0), new Vec2(1, 0)], [1e-8]);
    expect(snapped.sagittas[0]).toBe(0);
    expect(snapped.segment(0)).toBeInstanceOf(Line2);
    expect(smooth.segment(1)).toBeInstanceOf(Arc2);
  });

  test('copies its input vertices', () => {
    const vertices = [new Vec2(0, 0), new Vec2(1, 0)];
    const path = new ArcPolyline2(vertices, [0]);
    expect(path.vertices[0]).not.toBe(vertices[0]);
  });

  test('fromSegments and fromPolyline', () => {
    const path = ArcPolyline2.fromSegments(smooth.segments());
    expect(path.sagittas).toEqual(smooth.sagittas);
    expect(() =>
      ArcPolyline2.fromSegments([new Line2(new Vec2(0, 0), new Vec2(1, 0)), new Line2(new Vec2(2, 0), new Vec2(3, 0))]),
    ).toThrow(/does not start/);
    const fromPolyline = ArcPolyline2.fromPolyline(new Polyline2([new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1)]));
    expect(fromPolyline.sagittas).toEqual([0, 0]);
  });
});

describe('ArcPolyline2 evaluation', () => {
  test('lengthTable totals', () => {
    const table = smooth.lengthTable();
    expect(table.length).toBe(3);
    expectClose(table[1]!, 2);
    expectClose(table[2]!, 2 + Math.PI / 2);
    expectClose(smooth.length(), 2 + Math.PI / 2);
  });

  test('evaluateAtLength at and between segment boundaries', () => {
    expectVec2Close(smooth.evaluateAtLength(0), new Vec2(0, 0));
    expectVec2Close(smooth.evaluateAtLength(2), new Vec2(2, 0));
    expectVec2Close(smooth.evaluateAtLength(smooth.length()), new Vec2(3, 1));
    const h = Math.SQRT1_2;
    expectVec2Close(smooth.evaluateAtLength(2 + Math.PI / 4), new Vec2(2 + h, 1 - h));
    expectVec2Close(smooth.evaluate(1.5), new Vec2(2 + h, 1 - h));
    expectVec2Close(smooth.evaluate(2), new Vec2(3, 1));
  });

  test('tangents, normals and kinks', () => {
    expectVec2Close(smooth.tangentAtLength(2), new Vec2(1, 0));
    expectVec2Close(smooth.tangentAtLength(smooth.length()), new Vec2(0, 1));
    expectVec2Close(smooth.normalAtLength(1), new Vec2(0, 1));
    expect(smooth.isKink(1)).toBe(false);
    expect(corner.isKink(1)).toBe(true);
    expect(corner.isKink(0)).toBe(false);
    // At a kink the outgoing segment wins, except at the very end.
    expectVec2Close(corner.tangentAtLength(2), new Vec2(0, 1));
    expectVec2Close(corner.tangentAtLength(4), new Vec2(0, 1));
  });
});

describe('ArcPolyline2 queries', () => {
  test('closest lengths and ties', () => {
    expect(corner.closestLengthsForPoint(new Vec2(1, 1)).map((l) => +l.toFixed(9))).toEqual([1, 3]);
    expectClose(corner.closestLengthForPoint(new Vec2(1, 1)), 1);
    expectClose(corner.distanceToPoint(new Vec2(1, 1)), 1);
    // The arc's centre is equally far from the whole arc: the smallest length wins.
    expectClose(smooth.closestLengthForPoint(new Vec2(2, 1)), 2);
    expectVec2Close(smooth.closestPointForPoint(new Vec2(4, -1)), new Vec2(2 + Math.SQRT1_2, 1 - Math.SQRT1_2));
  });

  test('sideOfPoint', () => {
    expect(corner.sideOfPoint(new Vec2(1, 1))).toBe(1);
    expect(corner.sideOfPoint(new Vec2(1, -1))).toBe(-1);
    expect(corner.sideOfPoint(new Vec2(1, 0))).toBe(0);
    expect(corner.sideOfPoint(new Vec2(3, -1))).toBe(-1); // outside the corner, nearest the vertex
    expect(smooth.sideOfPoint(new Vec2(2.5, 0.8))).toBe(1); // inside the arc's turn
  });

  test('aabb2 covers the arc', () => {
    const box = smooth.aabb2();
    expectClose(box.x.max, 3);
    expectClose(box.y.min, 0);
  });
});

describe('ArcPolyline2 editing', () => {
  test('reverse keeps the same points', () => {
    const reversed = smooth.reverse();
    expectVertices(reversed, [new Vec2(3, 1), new Vec2(2, 0), new Vec2(0, 0)]);
    expectClose(reversed.sagittas[0]!, quarter);
    expect(reversed.sagittas[1]).toBe(0);
    for (const l of [0.5, 2.5, 3]) {
      expectVec2Close(reversed.evaluateAtLength(smooth.length() - l), smooth.evaluateAtLength(l));
    }
  });

  test('slice cuts arcs at the partial sweep', () => {
    const part = smooth.slice(1, 2 + Math.PI / 4);
    expectVertices(part, [new Vec2(1, 0), new Vec2(2, 0), smooth.evaluateAtLength(2 + Math.PI / 4)]);
    expectClose(part.sagittas[1]!, -(1 - Math.cos(Math.PI / 8)));
    expectClose(part.length(), 1 + Math.PI / 4);
    expect(() => smooth.slice(1, 1)).toThrow();
  });

  test('split', () => {
    const [head, tail] = smooth.split(2);
    expectClose(head.length(), 2);
    expectClose(tail.length(), Math.PI / 2);
    expect(head.segmentCount()).toBe(1);
  });

  test('transform: rotation, scale, reflection; a shear throws with arcs', () => {
    const rotated = smooth.transform(Mat3.rotation(Math.PI));
    expectVec2Close(rotated.vertices[2]!, new Vec2(-3, -1));
    expectClose(rotated.sagittas[1]!, -quarter);
    expectClose(smooth.transform(Mat3.scale(2)).sagittas[1]!, -2 * quarter);
    expectClose(smooth.transform(Mat3.scale(1, -1)).sagittas[1]!, quarter);
    expect(() => smooth.transform(Mat3.scale(2, 1))).toThrow(/similarity/);
    expect(corner.transform(Mat3.scale(2, 1)).vertices[2]!.x).toBe(4); // straight paths take any transform
  });

  test('toPolyline shares vertices between segments', () => {
    const polyline = smooth.toPolyline(0.01);
    const arcSteps = smooth.segment(1).type === 'Arc2' ? (smooth.segment(1) as Arc2).toPolyline(0.01).length - 1 : 0;
    expect(polyline.vertices.length).toBe(1 + 1 + arcSteps);
  });

  test('JSON', () => {
    expect(corner.toJson()).toEqual({
      type: 'ArcPolyline2',
      vertices: corner.vertices.map((v) => v.toJson()),
      sagittas: [0, 0],
    });
  });
});

describe('ArcPolyline2.offset', () => {
  test('straight and arc with a smooth join', () => {
    const inner = smooth.offset(0.5); // left: towards the arc's centre
    expectVertices(inner, [new Vec2(0, 0.5), new Vec2(2, 0.5), new Vec2(2.5, 1)]);
    expectClose(inner.sagittas[1]!, -0.5 * quarter);
    const outer = smooth.offset(-0.5);
    expectVertices(outer, [new Vec2(0, -0.5), new Vec2(2, -0.5), new Vec2(3.5, 1)]);
  });

  test('a kink is mitred', () => {
    expectVertices(corner.offset(0.5), [new Vec2(0, 0.5), new Vec2(1.5, 0.5), new Vec2(1.5, 2)]);
    expectVertices(corner.offset(-0.5), [new Vec2(0, -0.5), new Vec2(2.5, -0.5), new Vec2(2.5, 2)]);
  });

  test('beyond the miter limit a straight connector joins the ends', () => {
    const joined = corner.offset(-0.5, { miterLimit: 1 });
    expectVertices(joined, [new Vec2(0, -0.5), new Vec2(2, -0.5), new Vec2(2.5, 0), new Vec2(2.5, 2)]);
    expect(joined.sagittas).toEqual([0, 0, 0]);
  });

  test('an arc meeting a line at a kink is trimmed on its circle', () => {
    // Straight up to (0,2), then a clockwise half circle over to (2,2).
    const path = new ArcPolyline2([new Vec2(0, 0), new Vec2(0, 2), new Vec2(2, 2)], [0, 1]);
    const offset = path.offset(-0.5); // right: into the half circle
    const arc = offset.segment(1) as Arc2;
    expectClose(arc.radius(), 0.5);
    expectVec2Close(arc.centre(), new Vec2(1, 2));
    expectVec2Close(offset.vertices[1]!, new Vec2(0.5, 2));
  });

  test('a collapsing arc throws', () => {
    expect(() => smooth.offset(1.5)).toThrow(/collapses/);
  });
});
