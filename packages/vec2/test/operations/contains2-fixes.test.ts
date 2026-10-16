import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../src/core/epsilon';
import { Vec2 } from '../../src/core/vec2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Contains2 } from '../../src/operations/contains2';

const V = (x: number, y: number) => new Vec2(x, y);
const lowerHalfPlane = new InfiniteLine2(V(0, 0), V(1, 0)); // y <= 0

describe('Contains2 rays in half-planes (M16)', () => {
  test('a ray parallel to the boundary and strictly inside is contained with preferOut', () => {
    expect(Contains2.contains(lowerHalfPlane, new Ray2(V(0, -1), V(1, 0)), Epsilon.preferOut)).toBe(true);
  });

  test('a short ray that slowly leaves is not contained', () => {
    expect(Contains2.contains(lowerHalfPlane, new Ray2(V(0, -1), V(1e-3, 1e-7)))).toBe(false);
  });

  test('a ray heading deeper inside is contained; one heading out is not', () => {
    expect(Contains2.contains(lowerHalfPlane, new Ray2(V(0, -1), V(1, -1)))).toBe(true);
    expect(Contains2.contains(lowerHalfPlane, new Ray2(V(0, -1), V(1, 1)))).toBe(false);
  });
});

describe('Contains2 tri-mesh guests in non-convex containers (M17)', () => {
  // A comb: teeth between x = 0..2, 4..6, 8..10 rising from a base at y = 0..2.
  const comb = new Polygon2([
    V(0, 0),
    V(10, 0),
    V(10, 10),
    V(8, 10),
    V(8, 2),
    V(6, 2),
    V(6, 10),
    V(4, 10),
    V(4, 2),
    V(2, 2),
    V(2, 10),
    V(0, 10),
  ]);
  const acrossTeeth = [V(1, 5), V(9, 5), V(9, 7)];

  test('a mesh spanning the gaps between teeth is not contained', () => {
    expect(Contains2.contains(comb, new TriMesh2(acrossTeeth, [[0, 1, 2]]))).toBe(false);
    expect(Contains2.contains(comb, new Polygon2(acrossTeeth))).toBe(false);
  });

  test('a mesh inside one tooth is contained', () => {
    expect(Contains2.contains(comb, new TriMesh2([V(0.5, 3), V(1.5, 3), V(1, 9)], [[0, 1, 2]]))).toBe(true);
  });
});
