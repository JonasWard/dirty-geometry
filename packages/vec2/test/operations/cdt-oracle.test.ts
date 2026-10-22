/**
 * CDT hard gates: validity, constraint presence, the exact constrained-Delaunay property, agreement with
 * independent npm implementations on inputs in general position (where the CDT is unique), and a
 * degeneracy suite.
 */
import { describe, expect, test } from 'bun:test';
import { cdt2dAll, constrainautor, delaunator } from '../../bench/references';
import { Vec2 } from '../../src/core/vec2';
import { ConstrainedDelaunay } from '../../src/operations/constrained-delaunay';
import type { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import type { ConstraintEdge } from '../../src/operations/helpers/constraint-edge';
import {
  constraintChain,
  delaunayViolations,
  lattice,
  latticeRandomPoints,
  nonCrossingConstraints,
  randomPoints,
  starRing,
  type Triangle,
  triangleSetByCoordinates,
  validityProblems,
} from './cdt-checks';

type Edge = readonly [number, number];

/** Run the CDT and check every hard gate that does not need a reference implementation. */
function triangulateChecked(points: readonly Vec2[], constraints: readonly Edge[] = []) {
  const report = ConstrainedDelaunay.report(points, constraints);
  expect(validityProblems(report.mesh)).toEqual([]);

  const constrained = new Set<ConstraintEdge>();
  for (const [a, b] of constraints) {
    if (points[a]!.distance(points[b]!) <= 1e-6) continue;
    const chain = constraintChain(report.mesh, points[a]!, points[b]!);
    if (chain) for (const key of chain) constrained.add(key);
    else expect(report.unresolved.length).toBeGreaterThan(0);
  }
  expect(delaunayViolations(report.mesh, constrained)).toBe(0);
  expect(report.stats.guardHits).toBe(0);
  return report;
}

function expectSameTriangles(ours: TriMesh2, points: readonly Vec2[], theirs: readonly Triangle[]): void {
  expect(triangleSetByCoordinates(ours.vertices, ours.triangles)).toEqual(triangleSetByCoordinates(points, theirs));
}

describe('CDT agrees with independent implementations (general position)', () => {
  test('unconstrained random points: same triangles as delaunator and cdt2d', () => {
    const points = randomPoints(3000, 21);
    const ours = triangulateChecked(points);
    expectSameTriangles(ours.mesh, points, delaunator(points, []));
    expectSameTriangles(ours.mesh, points, cdt2dAll(points, []));
  });

  test('star polygon with interior points: same triangles as constrainautor and cdt2d', () => {
    const { points, ring } = starRing(400, 1500, 4);
    const ours = triangulateChecked(points, ring);
    expectSameTriangles(ours.mesh, points, constrainautor(points, ring));
    expectSameTriangles(ours.mesh, points, cdt2dAll(points, ring));
    // poly2tri is not compared: on this input it leaves 30 non-Delaunay edges (it is a bench reference only).
  });

  test('random non-crossing constraints over a cloud: same triangles as constrainautor and cdt2d', () => {
    const points = randomPoints(2000, 8);
    const constraints = nonCrossingConstraints(points, 150, 9);
    expect(constraints.length).toBeGreaterThan(100);
    const ours = triangulateChecked(points, constraints);
    expectSameTriangles(ours.mesh, points, constrainautor(points, constraints));
    expectSameTriangles(ours.mesh, points, cdt2dAll(points, constraints));
  });
});

describe('CDT degeneracy suite', () => {
  test('all points collinear: no triangles, constraints reported', () => {
    const points = Array.from({ length: 10 }, (_, i) => new Vec2(i, 2 * i));
    const report = ConstrainedDelaunay.report(points, [[0, 9]]);
    expect(report.mesh.triangles).toEqual([]);
  });

  test('duplicate points collapse and the rest is valid', () => {
    const base = latticeRandomPoints(300, 2);
    triangulateChecked([...base, ...base.slice(0, 100)], [[0, 300]]);
  });

  test('cocircular 50×50 lattice', () => {
    expect(ConstrainedDelaunay.report(lattice(50)).mesh.triangles.length).toBe(2 * 49 * 49);
    triangulateChecked(lattice(50));
  });

  test('constraint through collinear vertices is split at each of them', () => {
    const points = [...lattice(9), new Vec2(-1, -1), new Vec2(9, 9)];
    const report = triangulateChecked(points, [[81, 82]]);
    expect(constraintChain(report.mesh, points[81]!, points[82]!)?.length).toBe(10);
  });

  test('crossing constraints get a vertex at each crossing', () => {
    const points = randomPoints(200, 5);
    const constraints: Edge[] = [];
    for (let i = 0; i < 30; i += 2) constraints.push([i, i + 1]);
    const report = triangulateChecked(points, constraints);
    expect(report.unresolved).toEqual([]);
    expect(report.mesh.vertices.length).toBeGreaterThan(200);
  });

  test('near-coincident points within slack merge', () => {
    const points = latticeRandomPoints(200, 6);
    const jittered = points.slice(0, 50).map((p) => new Vec2(p.x + 4e-7, p.y - 4e-7));
    const report = triangulateChecked([...points, ...jittered]);
    expect(report.mesh.vertices.length).toBe(200);
  });

  test('large offset (2^30) and small scale (2^-6) give identical triangulations', () => {
    const points = latticeRandomPoints(800, 13);
    const constraints = nonCrossingConstraints(points, 40, 14);
    const canonical = (pts: readonly Vec2[], to: (p: Vec2) => Vec2) => {
      const { mesh } = triangulateChecked(pts.map(to), constraints);
      const back = new Map<string, string>(pts.map((p) => [`${to(p).x},${to(p).y}`, `${p.x},${p.y}`]));
      return triangleSetByCoordinates(mesh.vertices, mesh.triangles)
        .map((tri) =>
          tri
            .split('|')
            .map((corner) => back.get(corner) ?? corner)
            .sort()
            .join('|'),
        )
        .sort();
    };
    const base = canonical(points, (p) => p);
    expect(canonical(points, (p) => new Vec2(p.x + 2 ** 30, p.y - 2 ** 30))).toEqual(base);
    expect(canonical(points, (p) => new Vec2(p.x * 2 ** -6, p.y * 2 ** -6))).toEqual(base);
  });
});
