import { describe, expect, test } from 'bun:test';
import { TriMesh2 } from '../../../src/geometry/regions/tri-mesh2';
import { Polygon2 } from '../../../src/geometry/regions/polygon2';
import { Vec2 } from '../../../src/core/vec2';
import { Epsilon } from '../../../src/core/epsilon';
import { buildingYardMesh, hPlateMesh, lWingMesh, swissCheeseMesh } from '../../../examples/tri-mesh2/meshes';

describe('TriMesh2 edges', () => {
  const square = new TriMesh2(
    [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)],
    [
      [0, 1, 2],
      [0, 2, 3],
    ],
  );

  test('unique, naked, and covered partition all edges', () => {
    expect(square.uniqueEdges()).toHaveLength(5);
    expect(square.nakedEdges()).toHaveLength(4);
    expect(square.coveredEdges()).toHaveLength(1);
  });
});

describe('TriMesh2 boundary loops', () => {
  const square = new TriMesh2(
    [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)],
    [
      [0, 1, 2],
      [0, 2, 3],
    ],
  );

  test('chains a single ccw outer loop', () => {
    const loops = square.boundaryLoops();

    expect(loops).toHaveLength(1);
    expect(loops[0]!.signedArea).toBeGreaterThan(0);
    expect(loops[0]!.polygon.vertices).toHaveLength(4);
    expect(
      Polygon2.isPointInside(
        loops.map((loop) => loop.polygon),
        new Vec2(0.5, 0.5),
      ),
    ).toBe(true);
  });

  test('returns separate loops for disconnected components', () => {
    const mesh = new TriMesh2(
      [
        new Vec2(0, 0),
        new Vec2(1, 0),
        new Vec2(1, 1),
        new Vec2(0, 1),
        new Vec2(3, 0),
        new Vec2(4, 0),
        new Vec2(4, 1),
        new Vec2(3, 1),
      ],
      [
        [0, 1, 2],
        [0, 2, 3],
        [4, 5, 6],
        [4, 6, 7],
      ],
    );

    const loops = mesh.boundaryLoops();

    expect(loops).toHaveLength(2);
    expect(loops.every((loop) => loop.signedArea > 0)).toBe(true);
  });

  test('returns outer and hole loops with opposite winding', () => {
    const mesh = new TriMesh2(
      [
        new Vec2(0, 0),
        new Vec2(3, 0),
        new Vec2(3, 3),
        new Vec2(0, 3),
        new Vec2(1, 1),
        new Vec2(2, 1),
        new Vec2(2, 2),
        new Vec2(1, 2),
      ],
      [
        [0, 1, 5],
        [0, 5, 4],
        [1, 2, 6],
        [1, 6, 5],
        [2, 3, 7],
        [2, 7, 6],
        [3, 0, 4],
        [3, 4, 7],
      ],
    );

    const loops = mesh.boundaryLoops();
    const areas = loops.map((loop) => loop.signedArea).sort((a, b) => b - a);

    expect(loops).toHaveLength(2);
    expect(areas[0]).toBeGreaterThan(0);
    expect(areas[1]).toBeLessThan(0);

    const polygons = loops.map((loop) => loop.polygon);
    expect(Polygon2.isPointInside(polygons, new Vec2(0.5, 0.5))).toBe(true);
    expect(Polygon2.isPointInside(polygons, new Vec2(1.5, 1.5))).toBe(false);
  });

  test('returns no loops for closed meshes', () => {
    const tetrahedronSplit = new TriMesh2(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0.5, 1), new Vec2(0.5, 0.5)],
      [
        [0, 1, 2],
        [0, 1, 3],
        [1, 2, 3],
        [2, 0, 3],
      ],
    );

    expect(tetrahedronSplit.boundaryLoops()).toHaveLength(0);
  });
});

function annulusMesh(): TriMesh2 {
  return new TriMesh2(
    [
      new Vec2(0, 0),
      new Vec2(3, 0),
      new Vec2(3, 3),
      new Vec2(0, 3),
      new Vec2(1, 1),
      new Vec2(2, 1),
      new Vec2(2, 2),
      new Vec2(1, 2),
    ],
    [
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ],
  );
}

describe('TriMesh2 containsPoint', () => {
  test('contains points inside a simple boundary mesh', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)],
      [
        [0, 1, 2],
        [0, 2, 3],
      ],
    );

    expect(mesh.containsPoint(new Vec2(0.5, 0.5))).toBe(true);
    expect(mesh.containsPoint(new Vec2(2, 0.5))).toBe(false);
  });

  test('excludes the hole in a mesh with a square cutout', () => {
    const mesh = annulusMesh();

    expect(mesh.containsPoint(new Vec2(0.5, 0.5))).toBe(true);
    expect(mesh.containsPoint(new Vec2(1.5, 1.5))).toBe(false);
    expect(mesh.containsPoint(new Vec2(2.5, 2.5))).toBe(true);
    expect(mesh.containsPoint(new Vec2(4, 1.5))).toBe(false);
  });

  test('treats boundary points as inside with default slack', () => {
    const mesh = annulusMesh();

    expect(mesh.containsPoint(new Vec2(0, 1.5))).toBe(true);
    expect(mesh.containsPoint(new Vec2(1, 1))).toBe(true);
  });

  test('falls back to triangle union for closed meshes', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0.5, 1), new Vec2(0.5, 0.5)],
      [
        [0, 1, 2],
        [0, 1, 3],
        [1, 2, 3],
        [2, 0, 3],
      ],
    );

    expect(mesh.boundaryLoops()).toHaveLength(0);
    expect(mesh.containsPoint(new Vec2(0.5, 0.4))).toBe(true);
    expect(mesh.containsPoint(new Vec2(2, 2))).toBe(false);
  });
});

describe('TriMesh2 complex meshes', () => {
  test('swiss cheese has four holes and excludes hole interiors', () => {
    const mesh = swissCheeseMesh();

    expect(mesh.boundaryLoops()).toHaveLength(5);
    expect(mesh.containsPoint(new Vec2(0.5, 0.5))).toBe(true);
    expect(mesh.containsPoint(new Vec2(1.75, 1.75))).toBe(false);
    expect(mesh.containsPoint(new Vec2(4.75, 5.75))).toBe(false);
    expect(mesh.containsPoint(new Vec2(9, 4))).toBe(true);
  });

  test('l-wing keeps material in both legs while excluding holes', () => {
    const mesh = lWingMesh();

    expect(mesh.boundaryLoops().length).toBeGreaterThanOrEqual(4);
    expect(mesh.containsPoint(new Vec2(8, 2))).toBe(true);
    expect(mesh.containsPoint(new Vec2(2, 8))).toBe(true);
    expect(mesh.containsPoint(new Vec2(1.75, 1.75))).toBe(false);
    expect(mesh.containsPoint(new Vec2(2, 7))).toBe(false);
  });

  test('building yard excludes courtyard holes', () => {
    const mesh = buildingYardMesh();

    expect(mesh.boundaryLoops().length).toBeGreaterThanOrEqual(3);
    expect(mesh.containsPoint(new Vec2(3, 3))).toBe(false);
    expect(mesh.containsPoint(new Vec2(12, 3))).toBe(false);
    expect(mesh.containsPoint(new Vec2(10, 11))).toBe(false);
    expect(mesh.containsPoint(new Vec2(8, 5))).toBe(true);
  });

  test('h-plate excludes five interior holes', () => {
    const mesh = hPlateMesh();

    expect(mesh.boundaryLoops()).toHaveLength(6);
    expect(mesh.containsPoint(new Vec2(6, 6))).toBe(false);
    expect(mesh.containsPoint(new Vec2(1.75, 1.5))).toBe(false);
    expect(mesh.containsPoint(new Vec2(6, 1.5))).toBe(true);
    expect(mesh.containsPoint(new Vec2(1.5, 10.5))).toBe(false);
  });
});

describe('TriMesh2 cleanup', () => {
  test('merges vertices within slack', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1e-7), new Vec2(0, 1)],
      [
        [0, 1, 2],
        [0, 2, 3],
      ],
      Epsilon.preferIn,
      1,
    );

    expect(mesh.vertices).toHaveLength(3);
    expect(mesh.triangles).toHaveLength(1);
  });

  test('removes degenerate and collinear triangles', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0), new Vec2(0, 1)],
      [
        [0, 1, 2],
        [0, 2, 3],
      ],
    );

    expect(mesh.triangles).toHaveLength(1);
    expect(mesh.vertices).toHaveLength(3);
  });

  test('withoutCleanup keeps raw vertices and triangles', () => {
    const vertices = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 0), new Vec2(0, 1)];
    const triangles: [number, number, number][] = [
      [0, 1, 2],
      [0, 2, 3],
    ];
    const mesh = TriMesh2.withoutCleanup(vertices, triangles);

    expect(mesh.vertices).toEqual(vertices);
    expect(mesh.triangles).toEqual(triangles);
    expect(mesh.vertices).toHaveLength(4);
    expect(mesh.triangles).toHaveLength(2);
    // Frozen copies: later changes to the caller's arrays cannot stale the boundary caches.
    expect(Object.isFrozen(mesh.vertices)).toBe(true);
    expect(Object.isFrozen(mesh.triangles[0])).toBe(true);
    triangles.pop();
    expect(mesh.triangles).toHaveLength(2);
  });
});

describe('TriMesh2 boundary loops at a pinch vertex (M18)', () => {
  test('follow the sharpest left turn by angle, not by edge length', () => {
    // Two CCW triangles touching only at (0, 0); the second is far away with long edges.
    const mesh = new TriMesh2(
      [new Vec2(-2, -1), new Vec2(0, 0), new Vec2(-2, 1), new Vec2(100, 80), new Vec2(100, 60)],
      [
        [0, 1, 2],
        [3, 1, 4],
      ],
    );
    const loops = mesh.boundaryLoops();
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      expect(loop.polygon.vertices).toHaveLength(3);
      expect(loop.signedArea).toBeGreaterThan(0);
    }
  });
});

