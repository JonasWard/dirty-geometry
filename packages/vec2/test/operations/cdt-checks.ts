/**
 * Shared CDT checks for the robustness and oracle suites: input generators, mesh validity, constraint
 * presence and the exact constrained-Delaunay property. Edges are keyed with `constraintEdge` (hash2).
 */
import { inCircle, orient } from '../../src/core/predicates';
import { Vec2 } from '../../src/core/vec2';
import type { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { convexHullLoop } from '../../src/operations/helpers/cdt/hull';
import { constraintEdge, type ConstraintEdge } from '../../src/operations/helpers/constraint-edge';
import { mulberry32 } from '../../examples/random';

export type Triangle = readonly [number, number, number];

export function lattice(size: number, step = 1, origin = new Vec2(0, 0)): Vec2[] {
  const points: Vec2[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) points.push(new Vec2(origin.x + i * step, origin.y + j * step));
  }
  return points;
}

/** Distinct random points on a 1/1024 lattice in [0, 1024)², so power-of-two transforms stay exact. */
export function latticeRandomPoints(count: number, seed: number): Vec2[] {
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

/** Random doubles in [0, size)²: in general position with probability 1 (no 3 collinear, no 4 cocircular). */
export function randomPoints(count: number, seed: number, size = 1000): Vec2[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => new Vec2(rng() * size, rng() * size));
}

/**
 * A star-shaped polygon of `count` vertices around (500, 500) (indices `0..count-1`, counter-clockwise)
 * and `inner` random points inside its inner radius. Ring edges are the constraints.
 */
export function starRing(count: number, inner: number, seed: number): { points: Vec2[]; ring: [number, number][] } {
  const rng = mulberry32(seed);
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ((i + 0.5 * rng()) / count) * 2 * Math.PI;
    const radius = 300 + 100 * rng();
    points.push(new Vec2(500 + radius * Math.cos(angle), 500 + radius * Math.sin(angle)));
  }
  for (let i = 0; i < inner; i++) {
    const angle = rng() * 2 * Math.PI;
    const radius = 290 * Math.sqrt(rng());
    points.push(new Vec2(500 + radius * Math.cos(angle), 500 + radius * Math.sin(angle)));
  }
  return { points, ring: points.slice(0, count).map((_, i) => [i, (i + 1) % count]) };
}

/** Up to `count` random constraints between `points` that cross neither each other nor pass through a point. */
export function nonCrossingConstraints(points: readonly Vec2[], count: number, seed: number): [number, number][] {
  const rng = mulberry32(seed);
  const kept: [number, number][] = [];
  for (let attempt = 0; attempt < count * 20 && kept.length < count; attempt++) {
    const a = Math.floor(rng() * points.length);
    const b = Math.floor(rng() * points.length);
    if (a === b || points[a]!.distance(points[b]!) > 300) continue;
    const pa = points[a]!;
    const pb = points[b]!;
    const clashes = kept.some(([c, d]) => {
      if (a === c || a === d || b === c || b === d) return false;
      const pc = points[c]!;
      const pd = points[d]!;
      return orient(pa, pb, pc) * orient(pa, pb, pd) <= 0 && orient(pc, pd, pa) * orient(pc, pd, pb) <= 0;
    });
    if (clashes || points.some((p, i) => i !== a && i !== b && onOpenSegment(pa, pb, p))) continue;
    kept.push([a, b]);
  }
  return kept;
}

function onOpenSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  if (orient(a, b, p) !== 0) return false;
  const t = p.subtract(a).dot(b.subtract(a));
  return t > 0 && t < b.subtract(a).dot(b.subtract(a));
}

export function meshEdges(triangles: readonly Triangle[]): Map<ConstraintEdge, number> {
  const uses = new Map<ConstraintEdge, number>();
  for (const [a, b, c] of triangles) {
    for (const key of [constraintEdge(a, b), constraintEdge(b, c), constraintEdge(c, a)]) {
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return uses;
}

/** Problems with the mesh as a triangulation of the convex hull of its vertices (empty when valid). */
export function validityProblems(mesh: TriMesh2): string[] {
  const problems: string[] = [];
  const { vertices, triangles } = mesh;
  const hull = convexHullLoop(vertices);
  if (hull.length < 3) return triangles.length === 0 ? [] : ['triangles on collinear input'];

  if (!triangles.every(([a, b, c]) => orient(vertices[a]!, vertices[b]!, vertices[c]!) > 0)) {
    problems.push('a triangle is not strictly counter-clockwise');
  }
  const directed = new Set<string>();
  for (const [a, b, c] of triangles) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = `${u}>${v}`;
      if (directed.has(key)) problems.push(`directed edge ${key} used twice`);
      directed.add(key);
    }
  }
  const edges = meshEdges(triangles);
  if ([...edges.values()].some((uses) => uses > 2)) problems.push('an edge has more than two triangles');

  const used = new Set(triangles.flat());
  if (used.size !== vertices.length) problems.push(`${vertices.length - used.size} vertices not in any triangle`);
  // A triangulated disk: V - E + F = 1.
  if (used.size - edges.size + triangles.length !== 1) problems.push('Euler characteristic is not 1');

  // Fan areas from one hull vertex: `orient` works on coordinate differences, so large offsets stay accurate.
  let hullArea = 0;
  for (let i = 1; i + 1 < hull.length; i++) {
    hullArea += orient(vertices[hull[0]!]!, vertices[hull[i]!]!, vertices[hull[i + 1]!]!) / 2;
  }
  let area = 0;
  for (const [a, b, c] of triangles) area += orient(vertices[a]!, vertices[b]!, vertices[c]!) / 2;
  if (Math.abs(area - hullArea) > 1e-9 * Math.max(1, Math.abs(hullArea))) {
    problems.push(`area ${area} differs from hull area ${hullArea}`);
  }
  return problems;
}

/**
 * Mesh edges covering the segment `from → to`: the mesh vertices on it (within `tolerance`, so float
 * crossing points count), in order, must be joined by mesh edges. `null` when the segment is not present.
 */
export function constraintChain(mesh: TriMesh2, from: Vec2, to: Vec2, tolerance = 1e-6): ConstraintEdge[] | null {
  const direction = to.subtract(from);
  const lengthSq = direction.dot(direction);
  const along: { index: number; t: number }[] = [];
  mesh.vertices.forEach((v, index) => {
    const offset = v.subtract(from);
    if (Math.abs(offset.crossProduct(direction)) > tolerance * Math.sqrt(lengthSq)) return;
    const t = offset.dot(direction) / lengthSq;
    if (t >= -1e-12 && t <= 1 + 1e-12) along.push({ index, t });
  });
  along.sort((a, b) => a.t - b.t);
  if (along.length < 2 || mesh.vertices[along[0]!.index]!.distance(from) > tolerance) return null;
  if (mesh.vertices[along.at(-1)!.index]!.distance(to) > tolerance) return null;
  const edges = meshEdges(mesh.triangles);
  const chain: ConstraintEdge[] = [];
  for (let i = 0; i + 1 < along.length; i++) {
    const key = constraintEdge(along[i]!.index, along[i + 1]!.index);
    if (!edges.has(key)) return null;
    chain.push(key);
  }
  return chain;
}

/** Interior edges outside `constrained` whose opposite vertex lies strictly inside the other circumcircle. */
export function delaunayViolations(mesh: TriMesh2, constrained: ReadonlySet<ConstraintEdge> = new Set()): number {
  const apexes = new Map<ConstraintEdge, { tri: Triangle; apex: number }[]>();
  for (const tri of mesh.triangles) {
    for (let k = 0; k < 3; k++) {
      const key = constraintEdge(tri[k]!, tri[(k + 1) % 3]!);
      const list = apexes.get(key) ?? [];
      list.push({ tri, apex: tri[(k + 2) % 3]! });
      apexes.set(key, list);
    }
  }
  let violations = 0;
  for (const [key, sides] of apexes) {
    if (sides.length !== 2 || constrained.has(key)) continue;
    const [first, second] = sides as [(typeof sides)[0], (typeof sides)[0]];
    const [a, b, c] = first.tri.map((i) => mesh.vertices[i]!) as [Vec2, Vec2, Vec2];
    if (inCircle(a, b, c, mesh.vertices[second.apex]!) > 0) violations++;
  }
  return violations;
}

/** Triangles as sorted coordinate strings, independent of vertex numbering and rotation. */
export function triangleSetByCoordinates(vertices: readonly Vec2[], triangles: readonly Triangle[]): string[] {
  return triangles
    .map((tri) =>
      tri
        .map((i) => `${vertices[i]!.x},${vertices[i]!.y}`)
        .sort()
        .join('|'),
    )
    .sort();
}
