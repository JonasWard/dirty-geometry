import { describe, expect, test } from 'bun:test';
import { ConstrainedDelaunay } from '../../src/operations/constrained-delaunay';
import { orient } from '../../src/core/predicates';
import { Vec2 } from '../../src/core/vec2';
import type { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { constraintEdge, type ConstraintEdge } from '../../src/operations/helpers/constraint-edge';
import {
  delaunayViolations,
  lattice,
  latticeRandomPoints,
  nonCrossingConstraints,
  randomPoints,
  validityProblems,
} from './cdt-checks';

/** Canonical triangle list by vertex index: each triangle rotated to its smallest index, then sorted. */
function triangleIndexSet(triangles: readonly (readonly [number, number, number])[]): string[] {
  return triangles
    .map(([a, b, c]) => {
      const m = Math.min(a, b, c);
      return (m === a ? [a, b, c] : m === b ? [b, c, a] : [c, a, b]).join(',');
    })
    .sort();
}

function meshArea(mesh: TriMesh2): number {
  let area = 0;
  for (const [a, b, c] of mesh.triangles) area += orient(mesh.vertices[a]!, mesh.vertices[b]!, mesh.vertices[c]!) / 2;
  return area;
}

function allCcw(mesh: TriMesh2): boolean {
  return mesh.triangles.every(([a, b, c]) => orient(mesh.vertices[a]!, mesh.vertices[b]!, mesh.vertices[c]!) > 0);
}

describe('CDT robustness', () => {
  test('50×50 collinear lattice: full coverage, all CCW', () => {
    const mesh = ConstrainedDelaunay.triangulate(lattice(50));

    expect(mesh.triangles.length).toBe(2 * 49 * 49);
    expect(meshArea(mesh)).toBe(49 * 49);
    expect(allCcw(mesh)).toBe(true);
    expect(validityProblems(mesh)).toEqual([]);
    expect(delaunayViolations(mesh)).toBe(0);
  });

  test('random points: exact Delaunay property holds for every edge', () => {
    const mesh = ConstrainedDelaunay.triangulate(latticeRandomPoints(1500, 7));

    expect(validityProblems(mesh)).toEqual([]);
    expect(delaunayViolations(mesh)).toBe(0);
  });

  test('constrained edges are the only non-Delaunay edges', () => {
    const points = latticeRandomPoints(400, 11);
    const constraints: [number, number][] = [];
    for (let i = 0; i < 20; i++) constraints.push([i * 2, i * 2 + 1]);
    const report = ConstrainedDelaunay.report(points, constraints);

    // Random segments cross each other; the packing splits them, so the mesh keys differ from the input.
    expect(report.unresolved).toEqual([]);
    expect(validityProblems(report.mesh)).toEqual([]);
    const edges = new Set<ConstraintEdge>();
    for (const [a, b, c] of report.mesh.triangles) {
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        edges.add(constraintEdge(u, v));
      }
    }
    expect(delaunayViolations(report.mesh, new Set(edges))).toBe(0);
  });

  test('power-of-two scale and large offset give the identical triangulation', () => {
    const points = latticeRandomPoints(600, 3);
    const constraints: [number, number][] = [
      [0, 1],
      [2, 3],
    ];
    const base = ConstrainedDelaunay.triangulate(points, constraints);

    const transforms = [
      (p: Vec2) => new Vec2(p.x * 2 ** -4 + 2 ** 20, p.y * 2 ** -4 - 2 ** 20),
      (p: Vec2) => new Vec2(p.x * 2 ** 6, p.y * 2 ** 6),
    ];
    for (const transform of transforms) {
      const moved = ConstrainedDelaunay.triangulate(points.map(transform), constraints);
      expect(moved.vertices.length).toBe(base.vertices.length);
      expect(triangleIndexSet(moved.triangles)).toEqual(triangleIndexSet(base.triangles));
    }
  });

  test('flat convex arc: the whole hull is covered', () => {
    const points: Vec2[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = i - 20;
      points.push(new Vec2(x, 400 - (x * x) / 4));
    }
    points.push(new Vec2(0, 0));
    const mesh = ConstrainedDelaunay.triangulate(points);

    // Hull: the arc plus the apex (0, 0); area by the shoelace formula over that loop.
    let hullArea = 0;
    const loop = [...points.slice(0, 41)].reverse();
    loop.push(new Vec2(0, 0));
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      hullArea += (a.x * b.y - b.x * a.y) / 2;
    }

    expect(validityProblems(mesh)).toEqual([]);
    expect(meshArea(mesh)).toBeCloseTo(Math.abs(hullArea), 6);
  });

  test('polygon with collinear boundary runs reports no unresolved constraints', () => {
    const ring = [
      ...lattice(1),
      new Vec2(1, 0),
      new Vec2(2, 0),
      new Vec2(3, 0),
      new Vec2(3, 1),
      new Vec2(3, 2),
      new Vec2(2, 2),
      new Vec2(1, 2),
      new Vec2(0, 2),
      new Vec2(0, 1),
    ];
    const constraints = ring.map((_, i) => [i, (i + 1) % ring.length] as [number, number]);
    const report = ConstrainedDelaunay.report(ring, constraints);

    expect(report.unresolved).toEqual([]);
    expect(meshArea(report.mesh)).toBe(6);
  });
});

describe('CDT work budgets (operation counts, not wall clock)', () => {
  // Budgets are about 1.3× the counts measured when the budgets were set; the old code used 25n to 30n.
  test('random points: about O(n) predicate calls', () => {
    const n = 2000;
    const { stats } = ConstrainedDelaunay.report(latticeRandomPoints(n, 5));

    expect(stats.inCircle).toBeLessThan(12 * n);
    expect(stats.guardHits).toBe(0);
  });

  test('collinear lattice: cocircular points stay within budget', () => {
    const n = 2500;
    const { stats } = ConstrainedDelaunay.report(lattice(50));

    expect(stats.inCircle).toBeLessThan(8 * n);
    expect(stats.guardHits).toBe(0);
  });

  test('constraints: a few walk steps and flips per point', () => {
    const points = randomPoints(4000, 9);
    const constraints = nonCrossingConstraints(points, 300, 10);
    const { stats } = ConstrainedDelaunay.report(points, constraints);

    expect(stats.walkSteps).toBeLessThan(2 * points.length);
    expect(stats.flips).toBeLessThan(2 * points.length);
    expect(stats.guardHits).toBe(0);
  });
});
