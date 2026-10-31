import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../src/core/vec2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { ArcBoolean2 } from '../../src/operations/arc-boolean2';

const totalArea = (polygons: readonly Polygon2[]) => polygons.reduce((sum, p) => sum + p.signedArea(), 0);

/** Area of the union of two unit discs whose centres are 1 apart. */
const lensArea = 2 * Math.acos(0.5) - 0.5 * Math.sqrt(3); // overlap of the two discs
const unionArea = 2 * Math.PI - lensArea;

describe('ArcBoolean2', () => {
  test('the union of two discs approaches the exact area as the tolerance shrinks', () => {
    const discs = [new Circle2(new Vec2(0, 0), 1), new Circle2(new Vec2(1, 0), 1)];
    const errors = [1e-2, 1e-3, 1e-4].map((chordTolerance) => {
      const { polygons } = ArcBoolean2.union(discs, { chordTolerance });
      expect(polygons.length).toBe(1);
      return Math.abs(totalArea(polygons) - unionArea);
    });
    expect(errors[1]!).toBeLessThan(errors[0]!);
    expect(errors[2]!).toBeLessThan(errors[1]!);
    expect(errors[2]!).toBeLessThan(1e-3);
  });

  test('intersect with a half-plane keeps half a disc', () => {
    const disc = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), 1));
    const lowerHalf = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)); // inside where signedDistance <= 0
    const { polygons } = ArcBoolean2.intersect([disc], [lowerHalf], { chordTolerance: 1e-4 });
    expect(Math.abs(totalArea(polygons) - Math.PI / 2)).toBeLessThan(1e-3);
  });

  test('subtracting a disc from a square leaves a hole', () => {
    const square = new Polygon2([new Vec2(-2, -2), new Vec2(2, -2), new Vec2(2, 2), new Vec2(-2, 2)]);
    const { polygons } = ArcBoolean2.subtract([square], [new Circle2(new Vec2(0, 0), 1)], { chordTolerance: 1e-4 });
    expect(Math.abs(totalArea(polygons) - (16 - Math.PI))).toBeLessThan(1e-3);
  });

  test('flatten keeps winding', () => {
    const hole = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), 1)).inverse();
    expect(ArcBoolean2.flatten(hole, 1e-3).signedArea()).toBeLessThan(0);
  });
});
