import { describe, expect, test } from 'bun:test';
import { Mat3 } from '../../../src/core/mat3';
import { Vec2 } from '../../../src/core/vec2';
import { Circle2 } from '../../../src/geometry/regions/circle2';
import { ArcPolygon2 } from '../../../src/geometry/regions/arc-polygon2';
import { Polygon2 } from '../../../src/geometry/regions/polygon2';
import { expectClose, expectVec2Close } from '../../testHelpers';

const rectangle = ArcPolygon2.fromPolygon(
  new Polygon2([new Vec2(0, 0), new Vec2(4, 0), new Vec2(4, 2), new Vec2(0, 2)]),
);
/** A 2×2 square whose right side bulges outward by 0.5. */
const bulged = new ArcPolygon2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)], [0, -0.5, 0, 0]);
/** A "D": straight along the x axis, then a half circle back over the top. */
const d = new ArcPolygon2([new Vec2(0, 0), new Vec2(2, 0)], [0, -1]);

function expectVertices(shape: { vertices: readonly Vec2[] }, expected: Vec2[]): void {
  expect(shape.vertices.length).toBe(expected.length);
  expected.forEach((v, i) => expectVec2Close(shape.vertices[i]!, v, 1e-9, `vertex ${i}`));
}

describe('ArcPolygon2 construction', () => {
  test('needs three vertices, or two around an arc', () => {
    expect(() => new ArcPolygon2([new Vec2(0, 0), new Vec2(1, 0)], [0, 0])).toThrow(/at least 3/);
    expect(d.segmentCount()).toBe(2);
    expect(() => new ArcPolygon2([new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1)], [0, 0])).toThrow(/one sagitta/);
    expect(() => new ArcPolygon2([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 0)], [0, 0, 0])).toThrow(/no length/);
  });

  test('evaluate wraps: u = k is vertex 0', () => {
    expectVec2Close(rectangle.evaluate(4), new Vec2(0, 0));
    expectVec2Close(rectangle.evaluateAtLength(rectangle.length()), new Vec2(0, 0));
    expectClose(rectangle.length(), 12);
    expect(rectangle.isKink(0)).toBe(true);
  });
});

describe('ArcPolygon2 region', () => {
  test('a circle: area, winding, inverse', () => {
    const circle = ArcPolygon2.fromCircle2(new Circle2(new Vec2(1, 1), 2));
    expectClose(circle.signedArea(), 4 * Math.PI);
    expect(circle.windingNumber(new Vec2(1, 1))).toBe(1);
    expect(circle.windingNumber(new Vec2(1, 2.5))).toBe(1);
    expect(circle.windingNumber(new Vec2(1, -0.5))).toBe(1);
    expect(circle.containsPoint(new Vec2(3.5, 1))).toBe(false);
    const inverted = circle.inverse();
    expectClose(inverted.signedArea(), -4 * Math.PI);
    expect(inverted.windingNumber(new Vec2(1, 1))).toBe(-1);
    expectVec2Close(inverted.vertices[0]!, circle.vertices[0]!);
  });

  test('a "D" shape', () => {
    expectClose(d.area(), Math.PI / 2);
    expect(d.containsPoint(new Vec2(1, 0.5))).toBe(true);
    expect(d.containsPoint(new Vec2(1, -0.5))).toBe(false);
  });

  test('an outward bulge adds its cap', () => {
    const r = 1.25;
    const sweep = 4 * Math.atan(0.5);
    expectClose(bulged.signedArea(), 4 + ((r * r) / 2) * (sweep - Math.sin(sweep)));
    expect(bulged.containsPoint(new Vec2(2.3, 1))).toBe(true);
    expect(bulged.containsPoint(new Vec2(2.6, 1))).toBe(false);
    expectClose(bulged.signedDistance(new Vec2(3, 1)), 0.5);
    expectClose(bulged.signedDistance(new Vec2(1, 1)), -1);
  });

  test('an inward bulge removes its cap', () => {
    const dented = new ArcPolygon2(bulged.vertices.slice(), [0, 0.5, 0, 0]);
    expect(dented.containsPoint(new Vec2(1.7, 1))).toBe(false);
    expect(dented.containsPoint(new Vec2(1.3, 1))).toBe(true);
    expect(dented.area()).toBeLessThan(4);
  });

  test('isPointInside by fill rule', () => {
    const outer = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), 3));
    const hole = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), 1)).inverse();
    expect(ArcPolygon2.isPointInside([outer, hole], new Vec2(0, 0))).toBe(false);
    expect(ArcPolygon2.isPointInside([outer, hole], new Vec2(2, 0))).toBe(true);
    expect(ArcPolygon2.isPointInside([outer, hole], new Vec2(0, 0), undefined, 'nonZero')).toBe(false);
  });

  test('aabb2 includes the bulge', () => {
    expectClose(bulged.aabb2().x.max, 2.5);
  });
});

describe('ArcPolygon2 editing', () => {
  test('a closed rectangle offset: each side moved, corners meeting', () => {
    expectVertices(rectangle.offset(0.5), [
      new Vec2(0.5, 0.5),
      new Vec2(3.5, 0.5),
      new Vec2(3.5, 1.5),
      new Vec2(0.5, 1.5),
    ]);
    expectVertices(rectangle.offset(-0.5), [
      new Vec2(-0.5, -0.5),
      new Vec2(4.5, -0.5),
      new Vec2(4.5, 2.5),
      new Vec2(-0.5, 2.5),
    ]);
  });

  test('offsetting a circle keeps it a circle', () => {
    const circle = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), 2));
    expectClose(circle.offset(-1).area(), 9 * Math.PI);
    expectClose(circle.offset(1).area(), Math.PI);
    expect(() => circle.offset(2)).toThrow(/collapses/);
  });

  test('slice wraps round vertex 0', () => {
    const part = rectangle.slice(11, 1);
    expectVertices(part, [new Vec2(0, 1), new Vec2(0, 0), new Vec2(1, 0)]);
    expectClose(part.length(), 2);
  });

  test('transform with a reflection flips the winding and the sagittas', () => {
    const mirrored = bulged.transform(Mat3.scale(-1, 1));
    expectClose(mirrored.signedArea(), -bulged.signedArea());
    expectClose(mirrored.sagittas[1]!, 0.5);
  });

  test('toPolygon approximates the area', () => {
    const circle = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), 1));
    const polygon = circle.toPolygon(1e-4);
    expect(Math.abs(polygon.area() - Math.PI)).toBeLessThan(1e-3);
    expect(polygon.signedArea()).toBeGreaterThan(0);
  });

  test('JSON', () => {
    expect(d.toJson()).toEqual({ type: 'ArcPolygon2', vertices: d.vertices.map((v) => v.toJson()), sagittas: [0, -1] });
  });
});
