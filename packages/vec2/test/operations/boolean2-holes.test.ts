import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../src/core/vec2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Boolean2 } from '../../src/operations/boolean2';

const V = (x: number, y: number) => new Vec2(x, y);
const square = (x0: number, y0: number, x1: number, y1: number) =>
  new Polygon2([V(x0, y0), V(x1, y0), V(x1, y1), V(x0, y1)]);
const clockwise = (polygon: Polygon2) => new Polygon2([...polygon.vertices].reverse());
const area = (polygons: readonly Polygon2[]) => polygons.reduce((sum, polygon) => sum + polygon.signedArea(), 0);

describe('Boolean2 clip polygons honour winding', () => {
  const subject = square(4, 4, 6, 6);
  const frameWithHole = [square(0, 0, 10, 10), clockwise(square(3, 3, 7, 7))];

  test('intersect: a subject inside a clip hole is not kept', () => {
    expect(Boolean2.intersect([subject], frameWithHole).polygons).toHaveLength(0);
  });

  test('subtract: a subject inside a clip hole survives', () => {
    expect(area(Boolean2.subtract([subject], frameWithHole).polygons)).toBeCloseTo(4, 6);
  });

  test('material between the outer clip and its hole is clipped as before', () => {
    const band = square(1, 1, 9, 2);
    expect(area(Boolean2.intersect([band], frameWithHole).polygons)).toBeCloseTo(8, 6);
  });

  test('a clockwise clip that is not inside another clip still acts as a solid', () => {
    expect(area(Boolean2.intersect([subject], [clockwise(square(0, 0, 10, 10))]).polygons)).toBeCloseTo(4, 6);
  });
});
