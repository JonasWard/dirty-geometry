import { describe, expect, test } from 'bun:test';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Interval2 } from '../../src/bounds/interval2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Epsilon } from '../../src/core/epsilon';
import { Contains2 } from '../../src/operations/contains2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';
import { annulusMesh, buildingYardMesh, hPlateMesh, lWingMesh, swissCheeseMesh } from '../../examples/tri-mesh2/meshes';
import {
  contains2ComplexMeshScenarios,
  contains2ComplexMeshGuestScenarios,
  contains2MeshScenarios,
  evaluateContainsScenario,
} from '../../examples/contains2/scenarios';

describe('Contains2', () => {
  const square = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);
  const unitCircle = new Circle2(new Vec2(0, 0), 1);
  const xAxis = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
  // Right half-plane is y <= 0 (negative signed distance for +X direction).

  describe('point in circle', () => {
    test('interior, boundary, exterior with slack', () => {
      expect(Contains2.contains(unitCircle, [new Vec2(0, 0)])).toBe(true);
      expect(Contains2.contains(unitCircle, [new Vec2(1, 0)], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(unitCircle, [new Vec2(1, 0)], Epsilon.preferOut)).toBe(false);
      expect(Contains2.contains(unitCircle, [new Vec2(2, 0)])).toBe(false);
    });

    test('custom strict-interior inset via negative slack', () => {
      expect(Contains2.contains(unitCircle, [new Vec2(0.999, 0)], Epsilon.custom(-0.01))).toBe(false);
      expect(Contains2.contains(unitCircle, [new Vec2(0.98, 0)], Epsilon.custom(-0.01))).toBe(true);
    });
  });

  describe('point in polygon', () => {
    test('interior, boundary, exterior', () => {
      expect(Contains2.contains(square, [new Vec2(5, 5)])).toBe(true);
      expect(Contains2.contains(square, [new Vec2(5, 0)], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(square, [new Vec2(5, 0)], Epsilon.preferOut)).toBe(false);
      expect(Contains2.contains(square, [new Vec2(15, 5)])).toBe(false);
    });
  });

  describe('point in half-plane (InfiniteLine2)', () => {
    test('right of +X is inside', () => {
      expect(Contains2.contains(xAxis, [new Vec2(3, -2)])).toBe(true);
      expect(Contains2.contains(xAxis, [new Vec2(3, 2)])).toBe(false);
      expect(Contains2.contains(xAxis, [new Vec2(3, 0)], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(xAxis, [new Vec2(3, 0)], Epsilon.preferOut)).toBe(false);
    });
  });

  describe('point in tri-mesh', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(0, 2), new Vec2(2, 2)],
      [
        [0, 1, 2],
        [1, 3, 2],
      ],
    );

    test('covers both triangles and boundary', () => {
      expect(Contains2.contains(mesh, [new Vec2(0.5, 0.5)])).toBe(true);
      expect(Contains2.contains(mesh, [new Vec2(1.5, 1.5)])).toBe(true);
      expect(Contains2.contains(mesh, [new Vec2(1, 0)], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(mesh, [new Vec2(1, 0)], Epsilon.preferOut)).toBe(false);
      expect(Contains2.contains(mesh, [new Vec2(-1, -1)])).toBe(false);
    });
  });

  describe('line segment in region', () => {
    test('segment inside square', () => {
      expect(Contains2.contains(square, [new Line2(new Vec2(1, 1), new Vec2(8, 8))])).toBe(true);
      expect(Contains2.contains(square, [new Line2(new Vec2(1, 1), new Vec2(20, 1))])).toBe(false);
    });

    test('segment on boundary respects slack', () => {
      const edge = new Line2(new Vec2(0, 0), new Vec2(10, 0));
      expect(Contains2.contains(square, [edge], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(square, [edge], Epsilon.preferOut)).toBe(false);
    });

    test('segment inside circle uses convex shortcut', () => {
      expect(Contains2.contains(unitCircle, [new Line2(new Vec2(-0.5, 0), new Vec2(0.5, 0))])).toBe(true);
      expect(Contains2.contains(unitCircle, [new Line2(new Vec2(0, 0), new Vec2(2, 0))])).toBe(false);
    });
  });

  describe('polyline and polygon guests', () => {
    test('polyline inside square', () => {
      const pl = new Polyline2([new Vec2(1, 1), new Vec2(5, 2), new Vec2(8, 8)]);
      expect(Contains2.contains(square, [pl])).toBe(true);
    });

    test('polyline with segment escaping square', () => {
      const pl = new Polyline2([new Vec2(1, 1), new Vec2(5, 5), new Vec2(20, 5)]);
      expect(Contains2.contains(square, [pl])).toBe(false);
    });

    test('polyline entirely outside container AABB is rejected early', () => {
      const pl = new Polyline2([new Vec2(12, 3), new Vec2(15, 4), new Vec2(18, 3)]);
      expect(Contains2.contains(square, [pl])).toBe(false);
    });

    test('inner polygon inside outer square', () => {
      const inner = new Polygon2([new Vec2(2, 2), new Vec2(4, 2), new Vec2(4, 4), new Vec2(2, 4)]);
      expect(Contains2.contains(square, [inner])).toBe(true);
    });

    test('segment through concave notch even when endpoints are inside', () => {
      const lShape = new Polygon2([
        new Vec2(0, 0),
        new Vec2(10, 0),
        new Vec2(10, 5),
        new Vec2(5, 5),
        new Vec2(5, 10),
        new Vec2(0, 10),
      ]);
      const shortcut = new Line2(new Vec2(4, 9), new Vec2(9, 4));
      expect(Contains2.contains(lShape, [shortcut])).toBe(false);
    });
  });

  describe('circle guest', () => {
    test('circle in circle', () => {
      const outer = new Circle2(new Vec2(0, 0), 5);
      const inner = new Circle2(new Vec2(1, 0), 2);
      const touching = new Circle2(new Vec2(3, 0), 2);
      expect(Contains2.contains(outer, [inner])).toBe(true);
      expect(Contains2.contains(outer, [touching], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(outer, [touching], Epsilon.preferOut)).toBe(false);
    });

    test('circle in half-plane', () => {
      const below = new Circle2(new Vec2(0, -2), 1);
      const touching = new Circle2(new Vec2(0, -1), 1);
      expect(Contains2.contains(xAxis, [below])).toBe(true);
      expect(Contains2.contains(xAxis, [touching], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(xAxis, [touching], Epsilon.preferOut)).toBe(false);
    });

    test('circle in polygon uses clearance from boundary', () => {
      const inner = new Circle2(new Vec2(5, 5), 2);
      const touching = new Circle2(new Vec2(9, 5), 1);
      const outside = new Circle2(new Vec2(12, 5), 1);
      expect(Contains2.contains(square, [inner])).toBe(true);
      expect(Contains2.contains(square, [touching], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(square, [touching], Epsilon.preferOut)).toBe(false);
      expect(Contains2.contains(square, [outside])).toBe(false);
    });

    test('circle outside container AABB is rejected early', () => {
      const outside = new Circle2(new Vec2(20, 5), 0.5);
      expect(Contains2.contains(square, [outside])).toBe(false);
    });
  });

  describe('tri-mesh guest', () => {
    const smallMesh = new TriMesh2([new Vec2(1, 1), new Vec2(3, 1), new Vec2(2, 3)], [[0, 1, 2]]);
    const escapingMesh = new TriMesh2([new Vec2(1, 1), new Vec2(11, 1), new Vec2(6, 6)], [[0, 1, 2]]);

    test('mesh fully inside square', () => {
      expect(Contains2.contains(square, [smallMesh])).toBe(true);
    });

    test('mesh with edge crossing square boundary', () => {
      expect(Contains2.contains(square, [escapingMesh])).toBe(false);
    });

    test('empty mesh requires all vertices inside', () => {
      const emptyInside = new TriMesh2([new Vec2(1, 1), new Vec2(2, 2)], []);
      const emptyOutside = new TriMesh2([new Vec2(1, 1), new Vec2(20, 20)], []);
      expect(Contains2.contains(square, [emptyInside])).toBe(true);
      expect(Contains2.contains(square, [emptyOutside])).toBe(false);
    });

    test('mesh with hole uses boundary loop signed-distance checks', () => {
      const ring = annulusMesh();
      expect(Contains2.contains(square, [ring])).toBe(true);
      expect(Contains2.contains(ring, [escapingMesh])).toBe(false);
    });
  });

  describe('complex mesh containers and guests', () => {
    const ring = annulusMesh();
    const swiss = swissCheeseMesh();
    const lWing = lWingMesh();
    const building = buildingYardMesh();
    const hPlate = hPlateMesh();
    const yardTriangle = new TriMesh2([new Vec2(3, 5), new Vec2(4.5, 5), new Vec2(3.75, 6)], [[0, 1, 2]]);

    test('mesh container respects holes for points', () => {
      expect(Contains2.contains(ring, [new Vec2(0.5, 0.5)])).toBe(true);
      expect(Contains2.contains(ring, [new Vec2(1.5, 1.5)])).toBe(false);
      expect(Contains2.contains(swiss, [new Vec2(0.5, 0.5)])).toBe(true);
      expect(Contains2.contains(swiss, [new Vec2(1.75, 1.75)])).toBe(false);
      expect(Contains2.contains(lWing, [new Vec2(2, 8)])).toBe(true);
      expect(Contains2.contains(hPlate, [new Vec2(6, 6)])).toBe(false);
    });

    test('mesh container uses signed-distance clearance for circles', () => {
      expect(Contains2.contains(ring, [new Circle2(new Vec2(0.5, 0.5), 0.2)])).toBe(true);
      expect(Contains2.contains(ring, [new Circle2(new Vec2(1.5, 1.5), 0.2)])).toBe(false);
      expect(Contains2.contains(hPlate, [new Circle2(new Vec2(9, 1), 0.3)])).toBe(true);
      expect(Contains2.contains(hPlate, [new Circle2(new Vec2(6, 6), 0.3)])).toBe(false);
    });

    test('mesh guest inside mesh and polygon containers', () => {
      expect(Contains2.contains(square, [ring])).toBe(true);
      expect(Contains2.contains(building, [yardTriangle])).toBe(true);
      expect(
        Contains2.contains(ring, [
          new Polygon2([new Vec2(2.2, 0.4), new Vec2(2.8, 0.4), new Vec2(2.8, 1), new Vec2(2.2, 1)]),
        ]),
      ).toBe(true);
    });

    test('mesh guest crossing container hole or boundary is rejected', () => {
      expect(
        Contains2.contains(swiss, [
          new TriMesh2([new Vec2(1.4, 1.4), new Vec2(2.6, 1.4), new Vec2(2, 2.6)], [[0, 1, 2]]),
        ]),
      ).toBe(false);
      expect(
        Contains2.contains(swiss, [
          new TriMesh2([new Vec2(8, 0.5), new Vec2(9.5, 0.5), new Vec2(9, 1.5)], [[0, 1, 2]]),
        ]),
      ).toBe(true);
    });

    test('complex mesh guests in circle, polygon, and half-plane containers', () => {
      const largeFrame = new Polygon2([new Vec2(0, 0), new Vec2(12, 0), new Vec2(12, 12), new Vec2(0, 12)]);
      const shift = (mesh: TriMesh2, dx: number, dy: number) =>
        new TriMesh2(
          mesh.vertices.map((v) => new Vec2(v.x + dx, v.y + dy)),
          mesh.triangles,
        );

      expect(Contains2.contains(new Circle2(new Vec2(0, 0), 5), [ring])).toBe(true);
      expect(Contains2.contains(new Circle2(new Vec2(5, 4), 7), [swiss])).toBe(true);
      expect(Contains2.contains(new Circle2(new Vec2(4.5, 5.5), 8), [lWing])).toBe(true);
      expect(Contains2.contains(square, [swiss])).toBe(true);
      expect(Contains2.contains(largeFrame, [lWing, hPlate])).toBe(true);
      expect(Contains2.contains(xAxis, [shift(ring, 1, -4), shift(swiss, 1, -9)])).toBe(true);

      expect(Contains2.contains(new Circle2(new Vec2(0, 0), 5), [shift(ring, 3, 3)])).toBe(false);
      expect(
        Contains2.contains(new Polygon2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)]), [ring]),
      ).toBe(false);
      expect(Contains2.contains(xAxis, [ring])).toBe(false);
    });

    test('visualisation mesh scenarios match Contains2', () => {
      for (const scenario of [
        ...contains2MeshScenarios,
        ...contains2ComplexMeshScenarios,
        ...contains2ComplexMeshGuestScenarios,
      ]) {
        const expectedInside = !/cross|hole|span|escape/i.test(scenario.name);
        expect(evaluateContainsScenario(scenario)).toBe(expectedInside);
      }
    });
  });

  describe('ray and infinite line guests', () => {
    test('ray in half-plane', () => {
      const down = new Ray2(new Vec2(0, -1), new Vec2(0, -1));
      const up = new Ray2(new Vec2(0, -1), new Vec2(0, 1));
      expect(Contains2.contains(xAxis, [down])).toBe(true);
      expect(Contains2.contains(xAxis, [up])).toBe(false);
    });

    test('infinite line in half-plane only if parallel and on the inside', () => {
      const parallelInside = new InfiniteLine2(new Vec2(0, -2), new Vec2(1, 0));
      const parallelOutside = new InfiniteLine2(new Vec2(0, 2), new Vec2(1, 0));
      const crossing = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1));
      expect(Contains2.contains(xAxis, [parallelInside])).toBe(true);
      expect(Contains2.contains(xAxis, [parallelOutside])).toBe(false);
      expect(Contains2.contains(xAxis, [crossing])).toBe(false);
    });

    test('infinite guests are never inside bounded regions', () => {
      expect(Contains2.contains(unitCircle, [xAxis])).toBe(false);
      expect(Contains2.contains(square, [new Ray2(new Vec2(5, 5), new Vec2(1, 0))])).toBe(false);
    });

    test('degenerate zero-direction ray reduces to point test', () => {
      expect(Contains2.contains(square, [new Ray2(new Vec2(5, 5), new Vec2(0, 0))])).toBe(true);
      expect(Contains2.contains(square, [new Ray2(new Vec2(15, 5), new Vec2(0, 0))])).toBe(false);
    });
  });

  describe('pointIn static API', () => {
    test('delegates to contains for points', () => {
      expect(Contains2.pointIn(unitCircle, new Vec2(0, 0))).toBe(true);
      expect(Contains2.pointIn(square, new Vec2(5, 5))).toBe(true);
      expect(Contains2.pointIn(xAxis, new Vec2(1, -1))).toBe(true);
    });
  });

  describe('Aabb2 container', () => {
    const outer = Aabb2.fromIntervals(new Interval2(0, 10), new Interval2(0, 10));
    const inner = Aabb2.fromIntervals(new Interval2(2, 8), new Interval2(3, 7));
    const touching = Aabb2.fromIntervals(new Interval2(0, 5), new Interval2(0, 10));
    const disjoint = Aabb2.fromIntervals(new Interval2(11, 12), new Interval2(0, 1));

    test('point in box respects slack', () => {
      expect(Contains2.contains(outer, [new Vec2(5, 5)])).toBe(true);
      expect(Contains2.contains(outer, [new Vec2(0, 5)], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(outer, [new Vec2(0, 5)], Epsilon.preferOut)).toBe(false);
      expect(Contains2.contains(outer, [new Vec2(11, 5)])).toBe(false);
    });

    test('aabbIn uses interval containment for box in box', () => {
      expect(Contains2.contains(outer, [inner])).toBe(true);
      expect(Contains2.aabbIn(outer, inner)).toBe(true);
      expect(Contains2.aabbIn(outer, touching, Epsilon.preferIn)).toBe(true);
      expect(Contains2.aabbIn(outer, touching, Epsilon.preferOut)).toBe(false);
      expect(Contains2.aabbIn(outer, disjoint)).toBe(false);
    });

    test('circle in box uses axis clearance', () => {
      const fits = new Circle2(new Vec2(5, 5), 2);
      const touchingCircle = new Circle2(new Vec2(8, 5), 2);
      const outside = new Circle2(new Vec2(12, 5), 0.5);
      expect(Contains2.contains(outer, [fits])).toBe(true);
      expect(Contains2.contains(outer, [touchingCircle], Epsilon.preferIn)).toBe(true);
      expect(Contains2.contains(outer, [touchingCircle], Epsilon.preferOut)).toBe(false);
      expect(Contains2.contains(outer, [outside])).toBe(false);
    });

    test('aabbIn box in square polygon', () => {
      expect(Contains2.aabbIn(square, inner)).toBe(true);
      expect(Contains2.aabbIn(square, Aabb2.fromIntervals(new Interval2(9, 11), new Interval2(1, 2)))).toBe(false);
    });

    test('square polygon in box', () => {
      const innerSquare = new Polygon2([new Vec2(2, 2), new Vec2(4, 2), new Vec2(4, 4), new Vec2(2, 4)]);
      expect(Contains2.contains(outer, [innerSquare])).toBe(true);
      expect(Contains2.contains(inner, [innerSquare])).toBe(false);
    });

    test('fromIntervals round-trips through aabbIn', () => {
      const x = new Interval2(1, 9);
      const y = new Interval2(2, 8);
      const container = Aabb2.fromIntervals(x, y);
      const guest = Aabb2.fromIntervals(new Interval2(3, 7), new Interval2(4, 6));
      expect(Contains2.aabbIn(container, guest)).toBe(true);
      expect(Contains2.aabbIn(guest, container)).toBe(false);
    });

    test('aabbIn box in half-plane uses convex corner check', () => {
      const below = Aabb2.fromIntervals(new Interval2(-1, 1), new Interval2(-3, -1));
      const crossing = Aabb2.fromIntervals(new Interval2(-1, 1), new Interval2(-1, 1));
      expect(Contains2.aabbIn(xAxis, below)).toBe(true);
      expect(Contains2.aabbIn(xAxis, crossing)).toBe(false);
    });

    test('aabbIn box entirely outside half-plane is rejected early', () => {
      const above = Aabb2.fromIntervals(new Interval2(0, 2), new Interval2(2, 4));
      expect(Contains2.aabbIn(xAxis, above)).toBe(false);
    });

    test('multiple guests must all be contained', () => {
      expect(Contains2.contains(outer, new Vec2(5, 5))).toBe(true);
      expect(Contains2.contains(outer, [new Vec2(2, 2), new Vec2(8, 8)])).toBe(true);
      expect(Contains2.contains(outer, [new Vec2(2, 2), new Vec2(12, 8)])).toBe(false);
    });
  });
});
