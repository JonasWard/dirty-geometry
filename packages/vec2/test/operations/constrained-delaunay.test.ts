import { describe, expect, test } from 'bun:test';
import { ConstrainedDelaunay } from '../../src/operations/constrained-delaunay';
import { Epsilon } from '../../src/core/epsilon';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import type { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';
import {
  cdtBasicScenarios,
  cdtComplexScenarios,
  cdtShapeScenarios,
} from '../../examples/constrained-delaunay/scenarios';
import { expectClose } from '../testHelpers';

function edgeSet(triangles: readonly (readonly [number, number, number])[]): Set<string> {
  const edges = new Set<string>();
  for (const [a, b, c] of triangles) {
    edges.add(key(a, b));
    edges.add(key(b, c));
    edges.add(key(c, a));
  }
  return edges;
}

function key(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function triangleArea(a: Vec2, b: Vec2, c: Vec2): number {
  return 0.5 * Math.abs(Vec2.orient(a, b, c));
}

function near(a: Vec2, b: Vec2): boolean {
  return a.distance(b) < Epsilon.value;
}

/** True if the mesh contains an edge whose endpoints match `from`/`to` geometrically. */
function meshHasSegment(mesh: TriMesh2, from: Vec2, to: Vec2): boolean {
  for (const [a, b, c] of mesh.triangles) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [number, number][]) {
      const p = mesh.vertices[u]!;
      const q = mesh.vertices[v]!;
      if ((near(p, from) && near(q, to)) || (near(p, to) && near(q, from))) {
        return true;
      }
    }
  }
  return false;
}

type ShapeInput = { kind: 'polyline'; shape: Polyline2 } | { kind: 'polygon'; shape: Polygon2 };

/**
 * Packs polylines/polygons into sources for {@link ConstrainedDelaunay.fromGeometries}.
 * Optional Steiner points are appended without constraints.
 */
function constrainedDelaunayFromShapes(
  shapes: ShapeInput[],
  steiner: Vec2[] = [],
): { mesh: TriMesh2; segments: { from: Vec2; to: Vec2 }[] } {
  const geometries = [...shapes.map((entry) => entry.shape), ...steiner];
  const { constraintSegments } = ConstrainedDelaunay.collectSources(geometries);

  return {
    mesh: ConstrainedDelaunay.fromGeometries(geometries),
    segments: constraintSegments,
  };
}

function expectAllSegmentsPresent(mesh: TriMesh2, segments: { from: Vec2; to: Vec2 }[]): void {
  for (const segment of segments) {
    const present =
      meshHasSegment(mesh, segment.from, segment.to) || meshHasSplitConstraint(mesh, segment.from, segment.to);
    expect(present).toBe(true);
  }
}

function segmentsProperlyIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = Vec2.orient(a, b, c);
  const o2 = Vec2.orient(a, b, d);
  const o3 = Vec2.orient(c, d, a);
  const o4 = Vec2.orient(c, d, b);

  return (
    Math.sign(o1) !== Math.sign(o2) &&
    Math.sign(o3) !== Math.sign(o4) &&
    Math.abs(o1) > Epsilon.sq &&
    Math.abs(o2) > Epsilon.sq &&
    Math.abs(o3) > Epsilon.sq &&
    Math.abs(o4) > Epsilon.sq
  );
}

function meshEdgeCrossings(mesh: TriMesh2): number {
  const edges: { u: number; v: number; a: Vec2; b: Vec2 }[] = [];
  for (const [i, j, k] of mesh.triangles) {
    for (const [u, v] of [
      [i, j],
      [j, k],
      [k, i],
    ] as [number, number][]) {
      edges.push({ u, v, a: mesh.vertices[u]!, b: mesh.vertices[v]! });
    }
  }

  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i]!;
      const f = edges[j]!;
      if (e.u === f.u || e.u === f.v || e.v === f.u || e.v === f.v) continue;
      if (segmentsProperlyIntersect(e.a, e.b, f.a, f.b)) crossings++;
    }
  }
  return crossings;
}

function maxEdgeUse(mesh: TriMesh2): number {
  const counts = new Map<string, number>();
  for (const [a, b, c] of mesh.triangles) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [number, number][]) {
      const k = key(u, v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return Math.max(0, ...counts.values());
}

function expectValidMesh(mesh: TriMesh2): void {
  expect(meshEdgeCrossings(mesh)).toBe(0);
  expect(maxEdgeUse(mesh)).toBeLessThanOrEqual(2);

  for (const [a, b, c] of mesh.triangles) {
    const area = Vec2.orient(mesh.vertices[a]!, mesh.vertices[b]!, mesh.vertices[c]!);
    expect(area).toBeGreaterThan(Epsilon.sq);
  }
}

function expectConstraintsPresent(
  mesh: TriMesh2,
  points: readonly Vec2[],
  constraints: readonly [number, number][],
): void {
  for (const [a, b] of constraints) {
    expect(meshHasSegment(mesh, points[a]!, points[b]!)).toBe(true);
  }
}

describe('ConstrainedDelaunay', () => {
  test('empty input', () => {
    const mesh = ConstrainedDelaunay.triangulate([]);
    expect(mesh.vertices).toHaveLength(0);
    expect(mesh.triangles).toHaveLength(0);
  });

  test('single point yields no triangles', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(1, 2)]);
    expect(mesh.vertices).toHaveLength(1);
    expect(mesh.triangles).toHaveLength(0);
  });

  test('two points yield no triangles', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0)]);
    expect(mesh.vertices).toHaveLength(2);
    expect(mesh.triangles).toHaveLength(0);
  });

  test('three collinear points yield no triangles', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0)]);
    expect(mesh.triangles).toHaveLength(0);
  });

  test('three points yield one triangle', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1)]);
    expect(mesh.triangles).toHaveLength(1);
    expectClose(triangleArea(mesh.vertices[0]!, mesh.vertices[1]!, mesh.vertices[2]!), 0.5);
    expectValidMesh(mesh);
  });

  test('thin triangle stays valid', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 0.01)]);
    expect(mesh.triangles).toHaveLength(1);
    expectValidMesh(mesh);
  });

  test('square without constraints uses one diagonal', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)]);

    expect(mesh.triangles).toHaveLength(2);
    const edges = edgeSet(mesh.triangles);
    const hasDiag01 = edges.has(key(0, 2));
    const hasDiag02 = edges.has(key(1, 3));
    expect(hasDiag01 !== hasDiag02).toBe(true);
    expectValidMesh(mesh);
  });

  test('square with constrained opposite diagonal keeps that edge', () => {
    const points = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)];

    const mesh = ConstrainedDelaunay.triangulate(points, [[1, 3]]);
    const edges = edgeSet(mesh.triangles);

    expect(edges.has(key(1, 3))).toBe(true);
    expect(mesh.triangles).toHaveLength(2);
    expectValidMesh(mesh);
  });

  test('square with reversed constraint indices still forces the edge', () => {
    const points = [new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)];
    const mesh = ConstrainedDelaunay.triangulate(points, [[3, 1]]);
    expect(edgeSet(mesh.triangles).has(key(1, 3))).toBe(true);
    expectValidMesh(mesh);
  });

  test('duplicate constraints are ignored', () => {
    const points = [new Vec2(0, 0), new Vec2(3, 0), new Vec2(3, 3), new Vec2(0, 3)];
    const mesh = ConstrainedDelaunay.triangulate(points, [
      [0, 2],
      [2, 0],
      [0, 2],
    ]);
    expect(edgeSet(mesh.triangles).has(key(0, 2))).toBe(true);
    expect(mesh.triangles).toHaveLength(2);
    expectValidMesh(mesh);
  });

  test('self-loop constraint is ignored', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1)], [[1, 1]]);
    expect(mesh.triangles).toHaveLength(1);
    expectValidMesh(mesh);
  });

  test('constraint index out of range throws', () => {
    expect(() => ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1)], [[0, 5]])).toThrow();
    expect(() =>
      ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1)], [[-1, 1]]),
    ).toThrow();
  });

  test('constraint that is already a hull edge stays present', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(2, 0), new Vec2(1, 1)], [[0, 1]]);
    expect(edgeSet(mesh.triangles).has(key(0, 1))).toBe(true);
  });

  test('interior point is connected', () => {
    const mesh = ConstrainedDelaunay.triangulate([
      new Vec2(0, 0),
      new Vec2(4, 0),
      new Vec2(4, 4),
      new Vec2(0, 4),
      new Vec2(2, 2),
    ]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(4);
    const touched = new Set<number>();
    for (const [a, b, c] of mesh.triangles) {
      touched.add(a);
      touched.add(b);
      touched.add(c);
    }
    expect(touched.has(4)).toBe(true);
    expectValidMesh(mesh);
  });

  test('multiple interior points stay planar', () => {
    const points = [
      new Vec2(0, 0),
      new Vec2(6, 0),
      new Vec2(6, 6),
      new Vec2(0, 6),
      new Vec2(2, 2),
      new Vec2(4, 2),
      new Vec2(3, 4),
      new Vec2(1, 3),
    ];
    const mesh = ConstrainedDelaunay.triangulate(points);
    expect(mesh.triangles.length).toBeGreaterThanOrEqual(6);
    expectValidMesh(mesh);
  });

  test('polygon boundary constraints are all present', () => {
    const points = [new Vec2(0, 0), new Vec2(3, 0), new Vec2(4, 2), new Vec2(2, 4), new Vec2(0, 2)];
    const constraints: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
    ];

    const mesh = ConstrainedDelaunay.triangulate(points, constraints);
    const edges = edgeSet(mesh.triangles);

    for (const [a, b] of constraints) {
      expect(edges.has(key(a, b))).toBe(true);
    }
    expectValidMesh(mesh);
  });

  test('dedupes coincident vertices and remaps constraints', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2(0, 0)],
      [[3, 1]],
    );

    expect(mesh.vertices).toHaveLength(3);
    expect(edgeSet(mesh.triangles).has(key(0, 1))).toBe(true);
    expectValidMesh(mesh);
  });

  test('dedupes near-coincident vertices within epsilon', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(1, 2), new Vec2(Epsilon.value / 2, 0)],
      [[3, 1]],
    );
    expect(mesh.vertices).toHaveLength(3);
    expectValidMesh(mesh);
  });

  test('dedupes near-coincident vertices across grid cells', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1e-7), new Vec2(0, 1)],
      [],
    );

    expect(mesh.vertices).toHaveLength(3);
    expect(mesh.triangles).toHaveLength(1);
    expectValidMesh(mesh);
  });

  test('topology cleanup compacts deduped input into minimal mesh', () => {
    const mesh = ConstrainedDelaunay.triangulate([new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2(0, 0)], []);

    expect(mesh.vertices).toHaveLength(3);
    expect(mesh.triangles).toHaveLength(1);
    expectValidMesh(mesh);
  });

  test('output mesh has no degenerate triangles', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0), new Vec2(0, 1), new Vec2(0, 0)],
      [[0, 1]],
    );

    for (const [a, b, c] of mesh.triangles) {
      expect(triangleArea(mesh.vertices[a]!, mesh.vertices[b]!, mesh.vertices[c]!)).toBeGreaterThan(Epsilon.sq);
    }
    expectValidMesh(mesh);
  });

  test('splits constraint through intermediate vertex on segment', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(1, 0), new Vec2(1, 1)],
      [[0, 1]],
    );
    const edges = edgeSet(mesh.triangles);

    expect(edges.has(key(0, 2))).toBe(true);
    expect(edges.has(key(2, 1))).toBe(true);
    expectValidMesh(mesh);
  });

  test('splits constraint through several collinear vertices', () => {
    const points = [new Vec2(0, 0), new Vec2(4, 0), new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0), new Vec2(2, 2)];
    const mesh = ConstrainedDelaunay.triangulate(points, [[0, 1]]);
    const edges = edgeSet(mesh.triangles);

    expect(edges.has(key(0, 2))).toBe(true);
    expect(edges.has(key(2, 3))).toBe(true);
    expect(edges.has(key(3, 4))).toBe(true);
    expect(edges.has(key(4, 1))).toBe(true);
    expectValidMesh(mesh);
  });

  test('produces a planar mesh without crossing edges', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [
        new Vec2(0, 0),
        new Vec2(4, 0),
        new Vec2(4, 3),
        new Vec2(0, 3),
        new Vec2(1, 1),
        new Vec2(3, 2),
        new Vec2(2, 0.5),
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
      ],
    );

    expectValidMesh(mesh);
    expectConstraintsPresent(
      mesh,
      [
        new Vec2(0, 0),
        new Vec2(4, 0),
        new Vec2(4, 3),
        new Vec2(0, 3),
        new Vec2(1, 1),
        new Vec2(3, 2),
        new Vec2(2, 0.5),
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
      ],
    );
  });

  test('regular grid without constraints is planar', () => {
    const points: Vec2[] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        points.push(new Vec2(x, y));
      }
    }
    const mesh = ConstrainedDelaunay.triangulate(points);
    expect(mesh.triangles.length).toBeGreaterThanOrEqual(18);
    expectValidMesh(mesh);
  });

  test('spoke constraints from a hub stay present', () => {
    const hub = new Vec2(0, 0);
    const rim = [
      new Vec2(3, 0),
      new Vec2(2, 2),
      new Vec2(0, 3),
      new Vec2(-2, 2),
      new Vec2(-3, 0),
      new Vec2(-1, -2),
      new Vec2(1, -2),
    ];
    const points = [hub, ...rim];
    const constraints: [number, number][] = rim.map((_, i) => [0, i + 1]);
    const mesh = ConstrainedDelaunay.triangulate(points, constraints);

    expectConstraintsPresent(mesh, points, constraints);
    expectValidMesh(mesh);
  });

  test('forced diagonal across a point cloud', () => {
    const points = [
      new Vec2(0, 0),
      new Vec2(5, 0),
      new Vec2(5, 4),
      new Vec2(0, 4),
      new Vec2(1, 1),
      new Vec2(4, 1),
      new Vec2(4, 3),
      new Vec2(1, 3),
      new Vec2(2.5, 2),
    ];
    const mesh = ConstrainedDelaunay.triangulate(points, [[0, 2]]);
    // (2.5, 2) lies on the diagonal, so the constraint is split into pieces.
    expect(meshHasSplitConstraint(mesh, points[0]!, points[2]!)).toBe(true);
    expectValidMesh(mesh);
  });
});

describe('ConstrainedDelaunay from polylines and polygons', () => {
  test('L-polyline edges are forced', () => {
    const polyline = new Polyline2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 4)]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polyline', shape: polyline }]);

    expect(mesh.triangles.length).toBeGreaterThan(0);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('open polyline with many bends', () => {
    const polyline = new Polyline2([
      new Vec2(0, 0),
      new Vec2(1, 2),
      new Vec2(3, 1),
      new Vec2(4, 3),
      new Vec2(6, 2),
      new Vec2(7, 4),
      new Vec2(9, 3),
    ]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polyline', shape: polyline }]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('square polygon boundary is forced', () => {
    const square = new Polygon2([new Vec2(0, 0), new Vec2(5, 0), new Vec2(5, 5), new Vec2(0, 5)]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: square }]);

    expect(mesh.triangles).toHaveLength(2);
    expectAllSegmentsPresent(mesh, segments);
    expect(segments).toHaveLength(4);
    expectValidMesh(mesh);
  });

  test('irregular polygon keeps every boundary edge', () => {
    const polygon = new Polygon2([
      new Vec2(0, 1),
      new Vec2(2, 0),
      new Vec2(5, 0.5),
      new Vec2(4.5, 3),
      new Vec2(2, 4),
      new Vec2(0.5, 3),
    ]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: polygon }]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(4);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('octagon boundary is forced and planar', () => {
    const r = 4;
    const verts = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return new Vec2(Math.cos(a) * r, Math.sin(a) * r);
    });
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: new Polygon2(verts) }]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(6);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('collection: outer polygon plus interior wall polyline', () => {
    const outer = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 8), new Vec2(0, 8)]);
    const wall = new Polyline2([new Vec2(3, 1), new Vec2(3, 6), new Vec2(7, 6)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: outer },
      { kind: 'polyline', shape: wall },
    ]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(5);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('collection: several polylines as parallel walls', () => {
    const walls = [
      new Polyline2([new Vec2(1, 1), new Vec2(1, 5)]),
      new Polyline2([new Vec2(3, 0.5), new Vec2(3, 5.5)]),
      new Polyline2([new Vec2(5, 1), new Vec2(5, 5)]),
    ];
    const hull = new Polygon2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 6), new Vec2(0, 6)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: hull },
      ...walls.map((shape) => ({ kind: 'polyline' as const, shape })),
    ]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(8);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('collection: crossing interior polylines that meet at a shared vertex', () => {
    const hull = new Polygon2([new Vec2(0, 0), new Vec2(8, 0), new Vec2(8, 8), new Vec2(0, 8)]);
    const horizontal = new Polyline2([new Vec2(1, 4), new Vec2(4, 4), new Vec2(7, 4)]);
    const vertical = new Polyline2([new Vec2(4, 1), new Vec2(4, 4), new Vec2(4, 7)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: hull },
      { kind: 'polyline', shape: horizontal },
      { kind: 'polyline', shape: vertical },
    ]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('collection: outer polygon with inner polygon constraints', () => {
    const outer = new Polygon2([new Vec2(0, 0), new Vec2(8, 0), new Vec2(8, 8), new Vec2(0, 8)]);
    const inner = new Polygon2([new Vec2(2, 2), new Vec2(5, 2), new Vec2(5, 5), new Vec2(2, 5)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: outer },
      { kind: 'polygon', shape: inner },
    ]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(8);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('collection: three nested polygons', () => {
    const outer = new Polygon2([new Vec2(0, 0), new Vec2(12, 0), new Vec2(12, 12), new Vec2(0, 12)]);
    const mid = new Polygon2([new Vec2(2, 2), new Vec2(10, 2), new Vec2(10, 10), new Vec2(2, 10)]);
    const inner = new Polygon2([new Vec2(4, 4), new Vec2(8, 4), new Vec2(8, 8), new Vec2(4, 8)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: outer },
      { kind: 'polygon', shape: mid },
      { kind: 'polygon', shape: inner },
    ]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('shared corner between polyline and polygon splits the boundary edge', () => {
    const room = new Polygon2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 4), new Vec2(0, 4)]);
    const partition = new Polyline2([new Vec2(3, 0), new Vec2(3, 4)]);

    const { mesh } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: room },
      { kind: 'polyline', shape: partition },
    ]);

    expect(meshHasSegment(mesh, new Vec2(0, 0), new Vec2(3, 0))).toBe(true);
    expect(meshHasSegment(mesh, new Vec2(3, 0), new Vec2(6, 0))).toBe(true);
    expect(meshHasSegment(mesh, new Vec2(0, 4), new Vec2(3, 4))).toBe(true);
    expect(meshHasSegment(mesh, new Vec2(3, 4), new Vec2(6, 4))).toBe(true);
    expect(meshHasSegment(mesh, new Vec2(3, 0), new Vec2(3, 4))).toBe(true);
    expect(meshHasSegment(mesh, new Vec2(6, 0), new Vec2(6, 4))).toBe(true);
    expect(meshHasSegment(mesh, new Vec2(0, 0), new Vec2(0, 4))).toBe(true);
    expectValidMesh(mesh);
  });

  test('polygon with steiner points keeps boundary and uses interior sites', () => {
    const polygon = new Polygon2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 5), new Vec2(0, 5)]);
    const steiner = [new Vec2(2, 2), new Vec2(4, 3)];

    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: polygon }], steiner);

    expectAllSegmentsPresent(mesh, segments);
    expect(mesh.vertices.length).toBeGreaterThanOrEqual(6);
    expectValidMesh(mesh);

    for (const site of steiner) {
      expect(mesh.vertices.some((vertex) => near(vertex, site))).toBe(true);
    }
  });

  test('polygon with dense steiner cloud stays planar', () => {
    const polygon = new Polygon2([new Vec2(0, 0), new Vec2(5, 0), new Vec2(5, 5), new Vec2(0, 5)]);
    const steiner: Vec2[] = [];
    for (let y = 1; y <= 4; y++) {
      for (let x = 1; x <= 4; x++) {
        steiner.push(new Vec2(x, y));
      }
    }

    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: polygon }], steiner);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('zigzag polyline plus triangle polygon', () => {
    const zigzag = new Polyline2([new Vec2(0, 0), new Vec2(2, 3), new Vec2(4, 0), new Vec2(6, 3)]);
    const triangle = new Polygon2([new Vec2(1, -2), new Vec2(5, -2), new Vec2(3, -0.5)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polyline', shape: zigzag },
      { kind: 'polygon', shape: triangle },
    ]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(5);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('room with two partitions and a furniture rectangle', () => {
    const room = new Polygon2([new Vec2(0, 0), new Vec2(12, 0), new Vec2(12, 8), new Vec2(0, 8)]);
    const wallA = new Polyline2([new Vec2(4, 0), new Vec2(4, 5)]);
    const wallB = new Polyline2([new Vec2(4, 5), new Vec2(9, 5), new Vec2(9, 8)]);
    const table = new Polygon2([new Vec2(6, 1), new Vec2(10, 1), new Vec2(10, 3), new Vec2(6, 3)]);

    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polygon', shape: room },
      { kind: 'polyline', shape: wallA },
      { kind: 'polyline', shape: wallB },
      { kind: 'polygon', shape: table },
    ]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });
});

describe('ConstrainedDelaunay complex and self-intersecting shapes', () => {
  test('long wavy polyline stays planar and keeps chain', () => {
    const vertices = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      return new Vec2(t * 20, Math.sin(t * Math.PI * 4) * 2.5);
    });
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polyline', shape: new Polyline2(vertices) }]);

    expect(mesh.vertices.length).toBeGreaterThanOrEqual(24);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('large concave building outline', () => {
    const building = new Polygon2([
      new Vec2(0, 0),
      new Vec2(14, 0),
      new Vec2(14, 4),
      new Vec2(10, 4),
      new Vec2(10, 8),
      new Vec2(18, 8),
      new Vec2(18, 14),
      new Vec2(6, 14),
      new Vec2(6, 10),
      new Vec2(0, 10),
    ]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: building }]);

    expect(mesh.triangles.length).toBeGreaterThanOrEqual(8);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('campus hull with paths and courts', () => {
    const { mesh, segments } = constrainedDelaunayFromShapes([
      {
        kind: 'polygon',
        shape: new Polygon2([new Vec2(0, 0), new Vec2(20, 0), new Vec2(20, 14), new Vec2(0, 14)]),
      },
      {
        kind: 'polyline',
        shape: new Polyline2([
          new Vec2(2, 2),
          new Vec2(6, 2),
          new Vec2(6, 7),
          new Vec2(12, 7),
          new Vec2(12, 3),
          new Vec2(17, 3),
          new Vec2(17, 11),
        ]),
      },
      {
        kind: 'polyline',
        shape: new Polyline2([new Vec2(3, 12), new Vec2(3, 8), new Vec2(9, 8), new Vec2(9, 12)]),
      },
      {
        kind: 'polygon',
        shape: new Polygon2([new Vec2(14, 5), new Vec2(18, 5), new Vec2(18, 9), new Vec2(14, 9)]),
      },
    ]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('bowtie self-intersecting polygon inserts crossing and stays planar', () => {
    const bowtie = new Polygon2([new Vec2(0, 0), new Vec2(4, 3), new Vec2(0, 3), new Vec2(4, 0)]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: bowtie }]);

    // Crossing of diagonals (0,0)-(4,3) and (0,3)-(4,0) is near (2, 1.5).
    expect(mesh.vertices.some((v) => near(v, new Vec2(2, 1.5)))).toBe(true);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('self-intersecting pentagram polygon', () => {
    const tips = Array.from({ length: 5 }, (_, i) => {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      return new Vec2(Math.cos(angle) * 5, Math.sin(angle) * 5);
    });
    const verts = [tips[0]!, tips[2]!, tips[4]!, tips[1]!, tips[3]!];
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polygon', shape: new Polygon2(verts) }]);

    expect(mesh.vertices.length).toBeGreaterThan(verts.length);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('two polylines that cross multiple times', () => {
    const a = new Polyline2([new Vec2(0, 0), new Vec2(2, 1), new Vec2(4, 0), new Vec2(6, 2), new Vec2(8, 1)]);
    const b = new Polyline2([new Vec2(0, 2), new Vec2(2, 0), new Vec2(4, 2), new Vec2(6, 0), new Vec2(8, 2)]);
    const { mesh, segments } = constrainedDelaunayFromShapes([
      { kind: 'polyline', shape: a },
      { kind: 'polyline', shape: b },
    ]);

    expect(mesh.vertices.length).toBeGreaterThan(10);
    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('figure-eight polyline with repeated vertex', () => {
    const eight = new Polyline2([
      new Vec2(0, 0),
      new Vec2(2, 2),
      new Vec2(4, 0),
      new Vec2(2, -2),
      new Vec2(0, 0),
      new Vec2(-2, 2),
      new Vec2(-4, 0),
      new Vec2(-2, -2),
      new Vec2(0, 0),
    ]);
    const { mesh, segments } = constrainedDelaunayFromShapes([{ kind: 'polyline', shape: eight }]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('self-crossing corridors inside a room', () => {
    const { mesh, segments } = constrainedDelaunayFromShapes([
      {
        kind: 'polygon',
        shape: new Polygon2([new Vec2(0, 0), new Vec2(16, 0), new Vec2(16, 10), new Vec2(0, 10)]),
      },
      {
        kind: 'polyline',
        shape: new Polyline2([new Vec2(2, 1), new Vec2(8, 8), new Vec2(14, 1)]),
      },
      {
        kind: 'polyline',
        shape: new Polyline2([new Vec2(2, 8), new Vec2(8, 1), new Vec2(14, 8)]),
      },
      {
        kind: 'polygon',
        shape: new Polygon2([new Vec2(1, 3), new Vec2(4, 3), new Vec2(4, 6), new Vec2(1, 6)]),
      },
    ]);

    expectAllSegmentsPresent(mesh, segments);
    expectValidMesh(mesh);
  });

  test('crossing constraints add Steiner vertices at intersections', () => {
    const mesh = ConstrainedDelaunay.triangulate(
      [new Vec2(0, 0), new Vec2(4, 4), new Vec2(0, 4), new Vec2(4, 0)],
      [
        [0, 1],
        [2, 3],
      ],
    );

    expect(mesh.vertices.some((v) => near(v, new Vec2(2, 2)))).toBe(true);
    expect(meshHasSplitConstraint(mesh, new Vec2(0, 0), new Vec2(4, 4))).toBe(true);
    expect(meshHasSplitConstraint(mesh, new Vec2(0, 4), new Vec2(4, 0))).toBe(true);
    expectValidMesh(mesh);
  });
});

describe('ConstrainedDelaunay visualisation scenarios', () => {
  test('every basic scenario is planar and keeps constraints', () => {
    for (const scenario of cdtBasicScenarios) {
      const mesh = ConstrainedDelaunay.triangulate(scenario.points, scenario.constraints);
      expectValidMesh(mesh);
      for (const segment of scenario.constraintSegments) {
        expect(meshHasSegment(mesh, segment.from, segment.to)).toBe(true);
      }
    }
  });

  test('every shape scenario is planar and keeps constraints', () => {
    for (const scenario of cdtShapeScenarios) {
      const mesh = ConstrainedDelaunay.triangulate(scenario.points, scenario.constraints);
      expectValidMesh(mesh);

      for (const segment of scenario.constraintSegments) {
        const present =
          meshHasSegment(mesh, segment.from, segment.to) || meshHasSplitConstraint(mesh, segment.from, segment.to);
        expect(present).toBe(true);
      }
    }
  });

  test('every complex scenario is planar and keeps constraints', () => {
    for (const scenario of cdtComplexScenarios) {
      const mesh = ConstrainedDelaunay.triangulate(scenario.points, scenario.constraints);
      expectValidMesh(mesh);

      for (const segment of scenario.constraintSegments) {
        const present =
          meshHasSegment(mesh, segment.from, segment.to) || meshHasSplitConstraint(mesh, segment.from, segment.to);
        expect(present).toBe(true);
      }
    }
  });
});

/** True if from→to is covered by a chain of collinear mesh edges. */
function meshHasSplitConstraint(mesh: TriMesh2, from: Vec2, to: Vec2): boolean {
  if (meshHasSegment(mesh, from, to)) return true;

  const ab = to.subtract(from);
  const abLenSq = ab.dot(ab);
  if (abLenSq < Epsilon.sq) return near(from, to);

  const onSegment = (p: Vec2): boolean => {
    const ap = p.subtract(from);
    if (Math.abs(ap.crossProduct(ab)) > Epsilon.value * Math.sqrt(abLenSq)) return false;
    const t = ap.dot(ab) / abLenSq;
    return t >= -Epsilon.value && t <= 1 + Epsilon.value;
  };

  const verticesOn = mesh.vertices
    .map((v, index) => ({ v, index, t: v.subtract(from).dot(ab) / abLenSq }))
    .filter(({ v }) => onSegment(v))
    .sort((a, b) => a.t - b.t);

  for (let i = 0; i < verticesOn.length - 1; i++) {
    const a = verticesOn[i]!;
    const b = verticesOn[i + 1]!;
    if (!meshHasSegment(mesh, a.v, b.v)) return false;
  }

  return verticesOn.length >= 2 && near(verticesOn[0]!.v, from) && near(verticesOn.at(-1)!.v, to);
}
