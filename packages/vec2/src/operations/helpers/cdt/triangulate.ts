import type { Index } from '../../../core/numbers';
import { Aabb2 } from '../../../bounds/aabb2';
import { Vec2 } from '../../../core/vec2';
import { convexHullLoop } from './hull';
import { CdtMesh, emptyCdtStats, type CdtStats } from './mesh';

/** Result of {@link triangulateConstrained}. */
export type CdtResult = {
  /** Counter-clockwise triangles over the input vertices. */
  triangles: [number, number, number][];
  /** Constraint edges `[a, b]` that could not be inserted (e.g. a vertex lies exactly on them). */
  unresolved: [number, number][];
  stats: CdtStats;
};

const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Constrained Delaunay triangulation of distinct `vertices`, with constraint edges given as index pairs
 * that do not cross each other or pass through other vertices. Covers the convex hull of the vertices.
 *
 * Bowyer–Watson insertion (walking point location, cavity search over adjacency) inside a super
 * triangle, then the hull edges and the constraints are forced in by flips (Sloan), and every other
 * edge is made locally Delaunay (Lawson). All predicates are exact.
 */
export function triangulateConstrained(
  vertices: readonly Vec2[],
  constraints: readonly (readonly [Index, Index])[],
  stats: CdtStats = emptyCdtStats(),
): CdtResult {
  const n = vertices.length;
  const hull = convexHullLoop(vertices);
  if (hull.length < 3) return { triangles: [], unresolved: constraints.map(([a, b]) => [a, b]), stats };

  const box = Aabb2.fromPointList(vertices);
  const size = Math.max(box.width(), box.height(), 1);
  const center = Vec2.center(box.min(), box.max());
  const far = size * 100;
  const mesh = new CdtMesh(
    [
      ...vertices,
      new Vec2(center.x - far, center.y - far),
      new Vec2(center.x + far, center.y - far),
      new Vec2(center.x, center.y + far),
    ],
    stats,
  );
  mesh.addTriangle(n, n + 1, n + 2);
  // Spatially coherent order keeps each point-location walk short.
  for (const i of mortonOrder(vertices, box)) mesh.insert(i);

  const locked = new Set<string>();
  const unresolved: [number, number][] = [];
  // Hull edges first: once they are present, the super triangle only touches the outside of the hull.
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    if (mesh.insertConstraint(a, b)) locked.add(edgeKey(a, b));
  }
  for (const [a, b] of constraints) {
    if (a === b) continue;
    if (mesh.insertConstraint(a, b)) locked.add(edgeKey(a, b));
    else unresolved.push([a, b]);
  }

  mesh.legalize((u, v) => u < n && v < n && !locked.has(edgeKey(u, v)));

  const triangles: [number, number, number][] = [];
  for (const t of mesh.liveTriangles()) {
    const tri: [number, number, number] = [mesh.vertex(t, 0), mesh.vertex(t, 1), mesh.vertex(t, 2)];
    if (tri.every((index) => index < n)) triangles.push(tri);
  }
  // A constraint can be lost again by a later constraint's flips only if they cross, which callers rule out.
  return { triangles, unresolved, stats };
}

/** Vertex indices sorted along a Z-order (Morton) curve over `box`. */
function mortonOrder(vertices: readonly Vec2[], box: Aabb2): number[] {
  const width = box.width() || 1;
  const height = box.height() || 1;
  const spread = (value: number) => {
    let x = value & 0xffff;
    x = (x | (x << 8)) & 0x00ff00ff;
    x = (x | (x << 4)) & 0x0f0f0f0f;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;
    return x;
  };
  const code = vertices.map((v) => {
    const qx = Math.floor(((v.x - box.x.min) / width) * 0xffff);
    const qy = Math.floor(((v.y - box.y.min) / height) * 0xffff);
    return (spread(qx) | (spread(qy) << 1)) >>> 0;
  });
  return vertices.map((_, i) => i).sort((i, j) => code[i]! - code[j]! || i - j);
}
