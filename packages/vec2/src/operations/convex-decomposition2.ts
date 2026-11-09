import type { Index } from '../core/numbers';
import { Epsilon } from '../core/epsilon';
import { orientXY } from '../core/predicates';
import type { Vec2 } from '../core/vec2';
import { Polygon2 } from '../geometry/regions/polygon2';
import type { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { Boolean2 } from './boolean2';

/**
 * Splits a region into convex pieces that tile it exactly. The region is triangulated (constrained Delaunay,
 * triangles inside it only, so holes are left out), then neighbouring triangles are merged across a shared edge
 * whenever both ends of that edge still turn convex (Hertel–Mehlhorn). At most four times the fewest possible
 * pieces; which pieces come out depends on the triangulation.
 */
export class ConvexDecomposition2 {
  private constructor() {}

  /**
   * Convex pieces of the region of `loops` (counter-clockwise outer loops, clockwise holes, non-zero rule as in
   * `Boolean2`), counter-clockwise and without overlaps. A single convex loop comes back as itself.
   */
  static decompose(loops: readonly Polygon2[], slack: Epsilon = Epsilon.preferIn): Polygon2[] {
    if (loops.length === 1 && loops[0]!.isConvex()) {
      const loop = loops[0]!;
      return [loop.signedArea() < 0 ? loop.inverse() : loop];
    }
    const mesh = Boolean2.union(loops, { mesh: true, slack }).triMesh;
    return mesh ? ConvexDecomposition2.fromMesh(mesh) : [];
  }

  /**
   * The triangles of `mesh` merged across their shared edges while the merged piece stays convex (exact turns at
   * the two ends of the removed edge). Triangles that share no edge stay separate pieces.
   */
  static fromMesh(mesh: TriMesh2): Polygon2[] {
    const { vertices } = mesh;
    const pieces = new Map<Index, Index[]>();
    const pieceOf: Index[] = [];
    const owner = new Map<string, Index>();
    mesh.triangles.forEach(([a, b, c], t) => {
      pieces.set(t, [a, b, c]);
      pieceOf.push(t);
      owner.set(`${a},${b}`, t);
      owner.set(`${b},${c}`, t);
      owner.set(`${c},${a}`, t);
    });
    const find = (t: Index): Index => {
      while (pieceOf[t] !== t) t = pieceOf[t] = pieceOf[pieceOf[t]!]!;
      return t;
    };
    const leftTurn = (a: Index, b: Index, c: Index) => {
      const [p, q, r] = [vertices[a]!, vertices[b]!, vertices[c]!];
      return orientXY(p.x, p.y, q.x, q.y, r.x, r.y) >= 0;
    };

    mesh.triangles.forEach(([a, b, c], t) => {
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const other = owner.get(`${v},${u}`);
        if (other === undefined || other < t) continue;
        const p = find(t);
        const q = find(other);
        if (p === q) continue;
        // Rotate piece p to run v … u and piece q to run u … v, then join them without the edge u–v.
        const first = rotateTo(pieces.get(p)!, v);
        const second = rotateTo(pieces.get(q)!, u);
        if (first[first.length - 1] !== u || second[second.length - 1] !== v) continue;
        if (!leftTurn(first[first.length - 2]!, u, second[1]!)) continue;
        if (!leftTurn(second[second.length - 2]!, v, first[1]!)) continue;
        pieces.set(p, [...first, ...second.slice(1, -1)]);
        pieces.delete(q);
        pieceOf[q] = p;
      }
    });

    return [...pieces.values()].map((loop) => new Polygon2(loop.map((i) => vertices[i]! as Vec2)));
  }
}

function rotateTo(loop: readonly Index[], start: Index): Index[] {
  const at = loop.indexOf(start);
  return [...loop.slice(at), ...loop.slice(0, at)];
}
