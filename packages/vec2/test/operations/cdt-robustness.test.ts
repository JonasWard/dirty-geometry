import { describe, expect, test } from 'bun:test';
import { constrainedDelaunay, constrainedDelaunayReport } from '../../src/operations/constrained-delaunay';
import { inCircle, orient } from '../../src/core/predicates';
import { Vec2 } from '../../src/core/vec2';
import type { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { mulberry32 } from '../../examples/random';

type Triangle = readonly [number, number, number];

function lattice(size: number, step = 1, origin = new Vec2(0, 0)): Vec2[] {
  const points: Vec2[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) points.push(new Vec2(origin.x + i * step, origin.y + j * step));
  }
  return points;
}

/** Distinct random points on a 1/1024 lattice in [0, 1024)², so power-of-two transforms stay exact. */
function latticeRandomPoints(count: number, seed: number): Vec2[] {
  const rng = mulberry32(seed);
  const seen = new Set<string>();
  const points: Vec2[] = [];
  while (points.length < count) {
    const x = Math.floor(rng() * 2 ** 20) / 1024;
    const y = Math.floor(rng() * 2 ** 20) / 1024;
    const key = `${x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(new Vec2(x, y));
  }
  return points;
}

function meshArea(mesh: TriMesh2): number {
  let area = 0;
  for (const [a, b, c] of mesh.triangles) area += orient(mesh.vertices[a]!, mesh.vertices[b]!, mesh.vertices[c]!) / 2;
  return area;
}

function allCcw(mesh: TriMesh2): boolean {
  return mesh.triangles.every(([a, b, c]) => orient(mesh.vertices[a]!, mesh.vertices[b]!, mesh.vertices[c]!) > 0);
}

/** Canonical triangle set: each triangle rotated so its smallest index comes first. */
function triangleSet(triangles: readonly Triangle[]): string[] {
  return triangles
    .map(([a, b, c]) => {
      const m = Math.min(a, b, c);
      const tri = m === a ? [a, b, c] : m === b ? [b, c, a] : [c, a, b];
      return tri.join(',');
    })
    .sort();
}

/** Every interior edge, apart from `constrained` ones, has no opposite vertex strictly inside the other circumcircle. */
function delaunayViolations(mesh: TriMesh2, constrained: ReadonlySet<string> = new Set()): number {
  const opposite = new Map<string, { tri: Triangle; apex: number }[]>();
  for (const tri of mesh.triangles) {
    for (let k = 0; k < 3; k++) {
      const u = tri[k]!;
      const v = tri[(k + 1) % 3]!;
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      const list = opposite.get(key) ?? [];
      list.push({ tri, apex: tri[(k + 2) % 3]! });
      opposite.set(key, list);
    }
  }

  let violations = 0;
  for (const [key, sides] of opposite) {
    if (sides.length !== 2 || constrained.has(key)) continue;
    const [first, second] = sides as [(typeof sides)[0], (typeof sides)[0]];
    const [a, b, c] = first.tri.map((i) => mesh.vertices[i]!) as [Vec2, Vec2, Vec2];
    if (inCircle(a, b, c, mesh.vertices[second.apex]!) > 0) violations++;
  }
  return violations;
}

describe('CDT robustness', () => {
  test('50×50 collinear lattice: full coverage, all CCW', () => {
    const mesh = constrainedDelaunay(lattice(50));

    expect(mesh.triangles.length).toBe(2 * 49 * 49);
    expect(meshArea(mesh)).toBe(49 * 49);
    expect(allCcw(mesh)).toBe(true);
    expect(delaunayViolations(mesh)).toBe(0);
  });

  test('random points: exact Delaunay property holds for every edge', () => {
    const mesh = constrainedDelaunay(latticeRandomPoints(1500, 7));

    expect(allCcw(mesh)).toBe(true);
    expect(delaunayViolations(mesh)).toBe(0);
  });

  test('constrained edges are the only non-Delaunay edges', () => {
    const points = latticeRandomPoints(400, 11);
    const constraints: [number, number][] = [];
    for (let i = 0; i < 20; i++) constraints.push([i * 2, i * 2 + 1]);
    const report = constrainedDelaunayReport(points, constraints);

    // Random segments cross each other; the façade splits them, so the mesh keys differ from the input.
    expect(report.unresolved).toEqual([]);
    expect(allCcw(report.mesh)).toBe(true);
    const edges = new Set<string>();
    for (const [a, b, c] of report.mesh.triangles) {
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const)
        edges.add(u < v ? `${u}:${v}` : `${v}:${u}`);
    }
    expect(delaunayViolations(report.mesh, edges)).toBe(0);
  });

  test('power-of-two scale and large offset give the identical triangulation', () => {
    const points = latticeRandomPoints(600, 3);
    const constraints: [number, number][] = [
      [0, 1],
      [2, 3],
    ];
    const base = constrainedDelaunay(points, constraints);

    const transforms = [
      (p: Vec2) => new Vec2(p.x * 2 ** -4 + 2 ** 20, p.y * 2 ** -4 - 2 ** 20),
      (p: Vec2) => new Vec2(p.x * 2 ** 6, p.y * 2 ** 6),
    ];
    for (const transform of transforms) {
      const moved = constrainedDelaunay(points.map(transform), constraints);
      expect(moved.vertices.length).toBe(base.vertices.length);
      expect(triangleSet(moved.triangles)).toEqual(triangleSet(base.triangles));
    }
  });

  test('flat convex arc: the whole hull is covered', () => {
    const points: Vec2[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = i - 20;
      points.push(new Vec2(x, 400 - (x * x) / 4));
    }
    points.push(new Vec2(0, 0));
    const mesh = constrainedDelaunay(points);

    // Hull: the arc plus the apex (0, 0); area by the shoelace formula over that loop.
    let hullArea = 0;
    const loop = [...points.slice(0, 41)].reverse();
    loop.push(new Vec2(0, 0));
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      hullArea += (a.x * b.y - b.x * a.y) / 2;
    }

    expect(allCcw(mesh)).toBe(true);
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
    const report = constrainedDelaunayReport(ring, constraints);

    expect(report.unresolved).toEqual([]);
    expect(meshArea(report.mesh)).toBe(6);
  });
});

describe('CDT work budgets (operation counts, not wall clock)', () => {
  test('random points: about O(n) predicate calls and walk steps', () => {
    const n = 2000;
    const { stats } = constrainedDelaunayReport(latticeRandomPoints(n, 5));

    expect(stats.inCircle).toBeLessThan(25 * n);
    expect(stats.walkSteps).toBeLessThan(10 * n);
  });

  test('collinear lattice: cocircular points stay within budget', () => {
    const n = 2500;
    const { stats } = constrainedDelaunayReport(lattice(50));

    expect(stats.inCircle).toBeLessThan(30 * n);
    expect(stats.walkSteps).toBeLessThan(10 * n);
  });
});
