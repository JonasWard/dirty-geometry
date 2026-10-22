import type { Index } from '../../../core/numbers';
import { inCircle, orient } from '../../../core/predicates';
import type { Vec2 } from '../../../core/vec2';

/** Work counters for a triangulation, for count-based (not wall-clock) performance budgets. */
export type CdtStats = {
  orient: Index;
  inCircle: Index;
  flips: Index;
  walkSteps: Index;
  /** Times a safety limit stopped a loop early; non-zero means the result may be incomplete. */
  guardHits: Index;
};

export function emptyCdtStats(): CdtStats {
  return { orient: 0, inCircle: 0, flips: 0, walkSteps: 0, guardHits: 0 };
}

const NONE = -1;
const next = (i: number) => (i + 1) % 3;
const prev = (i: number) => (i + 2) % 3;

/**
 * Triangle mesh with adjacency for incremental Delaunay work. Triangle `t` has counter-clockwise
 * vertices `v(t, 0..2)`; edge `i` runs `v(t, i) → v(t, i + 1)` and `neighbour(t, i)` is the triangle on
 * its other side (or -1). All geometric decisions use exact predicates.
 */
export class CdtMesh {
  private readonly corners: number[] = [];
  private readonly neighbours: number[] = [];
  private readonly alive: boolean[] = [];
  /** Some live triangle touching each vertex. */
  private readonly vertexTriangle: number[];
  private lastTriangle = 0;

  constructor(
    readonly points: readonly Vec2[],
    readonly stats: CdtStats = emptyCdtStats(),
  ) {
    this.vertexTriangle = new Array<number>(points.length).fill(NONE);
  }

  vertex(t: number, i: number): number {
    return this.corners[t * 3 + i]!;
  }

  neighbour(t: number, i: number): number {
    return this.neighbours[t * 3 + i]!;
  }

  isAlive(t: number): boolean {
    return this.alive[t] === true;
  }

  get triangleSlots(): number {
    return this.alive.length;
  }

  *liveTriangles(): Generator<number> {
    for (let t = 0; t < this.alive.length; t++) if (this.alive[t]) yield t;
  }

  orient(a: number, b: number, c: number): number {
    this.stats.orient++;
    return orient(this.points[a]!, this.points[b]!, this.points[c]!);
  }

  /** True when `p` lies strictly inside the circumcircle of (CCW) triangle `t`. */
  inCircumcircle(t: number, p: number): boolean {
    this.stats.inCircle++;
    const [a, b, c] = [this.vertex(t, 0), this.vertex(t, 1), this.vertex(t, 2)];
    return inCircle(this.points[a]!, this.points[b]!, this.points[c]!, this.points[p]!) > 0;
  }

  addTriangle(a: number, b: number, c: number): number {
    const t = this.alive.length;
    this.corners.push(a, b, c);
    this.neighbours.push(NONE, NONE, NONE);
    this.alive.push(true);
    this.vertexTriangle[a] = t;
    this.vertexTriangle[b] = t;
    this.vertexTriangle[c] = t;
    this.lastTriangle = t;
    return t;
  }

  /** Index `i` of the directed edge `a → b` in `t`, or -1. */
  edgeIndex(t: number, a: number, b: number): number {
    for (let i = 0; i < 3; i++) {
      if (this.vertex(t, i) === a && this.vertex(t, next(i)) === b) return i;
    }
    return NONE;
  }

  private setNeighbour(t: number, i: number, u: number): void {
    this.neighbours[t * 3 + i] = u;
  }

  /** Point the edge of `u` that is shared with the directed edge `a → b` back at `t`. */
  private relink(u: number, a: number, b: number, t: number): void {
    if (u === NONE) return;
    const j = this.edgeIndex(u, b, a);
    if (j !== NONE) this.setNeighbour(u, j, t);
  }

  /** A live triangle containing `p` (inside or on its boundary), by walking from the last touched triangle. */
  locate(p: number): number {
    let t = this.isAlive(this.lastTriangle) ? this.lastTriangle : this.anyLiveTriangle();
    const limit = this.alive.length * 3 + 16;
    for (let step = 0; step < limit; step++) {
      this.stats.walkSteps++;
      let moved = false;
      // Rotate the starting edge so the walk cannot cycle between two triangles.
      const start = step % 3;
      for (let k = 0; k < 3; k++) {
        const i = (start + k) % 3;
        const u = this.neighbour(t, i);
        if (u !== NONE && this.orient(this.vertex(t, i), this.vertex(t, next(i)), p) < 0) {
          t = u;
          moved = true;
          break;
        }
      }
      if (!moved) return t;
    }
    // Fallback (not expected for Delaunay meshes): scan.
    for (const candidate of this.liveTriangles()) {
      if ([0, 1, 2].every((i) => this.orient(this.vertex(candidate, i), this.vertex(candidate, next(i)), p) >= 0)) {
        return candidate;
      }
    }
    throw new Error('CDT: point outside the triangulation');
  }

  private anyLiveTriangle(): number {
    for (const t of this.liveTriangles()) return t;
    throw new Error('CDT: empty triangulation');
  }

  /** Bowyer–Watson insertion of vertex `p`: remove the triangles whose circumcircle holds `p`, fan the cavity. */
  insert(p: number): void {
    const seed = this.locate(p);
    const cavity = new Set<number>([seed]);
    const stack = [seed];
    while (stack.length > 0) {
      const t = stack.pop()!;
      for (let i = 0; i < 3; i++) {
        const u = this.neighbour(t, i);
        if (u === NONE || cavity.has(u) || !this.inCircumcircle(u, p)) continue;
        cavity.add(u);
        stack.push(u);
      }
    }

    // Boundary edges a → b of the cavity become triangles (a, b, p).
    const startingAt = new Map<number, number>();
    const endingAt = new Map<number, number>();
    for (const t of cavity) {
      for (let i = 0; i < 3; i++) {
        const outer = this.neighbour(t, i);
        if (outer !== NONE && cavity.has(outer)) continue;
        const a = this.vertex(t, i);
        const b = this.vertex(t, next(i));
        const created = this.addTriangle(a, b, p);
        this.setNeighbour(created, 0, outer);
        this.relink(outer, a, b, created);
        startingAt.set(a, created);
        endingAt.set(b, created);
      }
    }
    for (const t of cavity) this.alive[t] = false;
    for (const [a, created] of startingAt) {
      const b = this.vertex(created, 1);
      this.setNeighbour(created, 1, startingAt.get(b)!);
      this.setNeighbour(created, 2, endingAt.get(a)!);
    }
  }

  /**
   * Flip edge `i` of `t` (u → v, shared with the neighbour) into the other diagonal of the quad when the
   * quad is strictly convex. Returns the new edge's triangle pair or `null` when it cannot flip.
   */
  flip(t: number, i: number): { t: number; s: number; p: number; q: number } | null {
    const s = this.neighbour(t, i);
    if (s === NONE) return null;
    const u = this.vertex(t, i);
    const v = this.vertex(t, next(i));
    const p = this.vertex(t, prev(i));
    const j = this.edgeIndex(s, v, u);
    if (j === NONE) return null;
    const q = this.vertex(s, prev(j));
    if (this.orient(p, u, q) <= 0 || this.orient(q, v, p) <= 0) return null;

    const acrossVP = this.neighbour(t, next(i));
    const acrossPU = this.neighbour(t, prev(i));
    const acrossUQ = this.neighbour(s, next(j));
    const acrossQV = this.neighbour(s, prev(j));

    // t becomes (p, u, q) and s becomes (q, v, p).
    this.corners.splice(t * 3, 3, p, u, q);
    this.neighbours.splice(t * 3, 3, acrossPU, acrossUQ, s);
    this.corners.splice(s * 3, 3, q, v, p);
    this.neighbours.splice(s * 3, 3, acrossQV, acrossVP, t);
    this.relink(acrossUQ, u, q, t);
    this.relink(acrossVP, v, p, s);
    this.vertexTriangle[u] = t;
    this.vertexTriangle[p] = t;
    this.vertexTriangle[q] = t;
    this.vertexTriangle[v] = s;
    this.lastTriangle = t;
    this.stats.flips++;
    return { t, s, p, q };
  }

  /** A triangle and edge index holding the undirected edge `a – b`, if it exists. */
  findEdge(a: number, b: number): { t: number; i: number } | null {
    for (const t of this.trianglesAround(a)) {
      const i = this.edgeIndex(t, a, b);
      if (i !== NONE) return { t, i };
      const j = this.edgeIndex(t, b, a);
      if (j !== NONE) return { t, i: j };
    }
    return null;
  }

  /**
   * Triangles incident to vertex `a`, by rotating around it: counter-clockwise until the fan closes,
   * and when it reaches the border first, also clockwise from the start.
   */
  trianglesAround(a: number): number[] {
    const first = this.vertexTriangle[a]!;
    if (first === NONE || !this.isAlive(first)) return [];
    const fan = [first];
    // In triangle (a, u, v) the next triangle counter-clockwise shares edge v → a, the next clockwise a → u.
    for (let t = first, guard = 0; guard <= this.alive.length; guard++) {
      const u = this.neighbour(t, prev(this.cornerIndex(t, a)));
      if (u === first) return fan;
      if (u === NONE) break;
      fan.push(u);
      t = u;
    }
    for (let t = first, guard = 0; guard <= this.alive.length; guard++) {
      const u = this.neighbour(t, this.cornerIndex(t, a));
      if (u === NONE || u === first) break;
      fan.push(u);
      t = u;
    }
    return fan;
  }

  private cornerIndex(t: number, a: number): number {
    for (let i = 0; i < 3; i++) if (this.vertex(t, i) === a) return i;
    throw new Error('CDT: vertex not in triangle');
  }

  /**
   * Insert the constraint edge `a – b` by flipping the edges it crosses (Sloan). Returns false when it
   * cannot be inserted, e.g. a vertex lies exactly on its interior.
   */
  insertConstraint(a: number, b: number): boolean {
    if (this.findEdge(a, b)) return true;
    const crossed = this.crossedEdges(a, b);
    if (!crossed) return false;

    const queue = crossed;
    let guard = 0;
    const limit = Math.max(64, queue.length * queue.length * 4);
    while (queue.length > 0) {
      if (guard++ > limit) return false;
      const [u, v] = queue.shift()!;
      const at = this.findEdge(u, v);
      if (!at) continue;
      const flipped = this.flip(at.t, at.i);
      if (!flipped) {
        queue.push([u, v]);
        continue;
      }
      const { p, q } = flipped;
      if (this.crossesProperly(a, b, p, q)) queue.push([p, q]);
    }
    return this.findEdge(a, b) !== null;
  }

  /** Does segment `p – q` cross the open segment `a – b` (not touching at an endpoint)? */
  private crossesProperly(a: number, b: number, p: number, q: number): boolean {
    if (p === a || p === b || q === a || q === b) return false;
    const op = this.orient(a, b, p);
    const oq = this.orient(a, b, q);
    const oa = this.orient(p, q, a);
    const ob = this.orient(p, q, b);
    return op * oq < 0 && oa * ob < 0;
  }

  /**
   * Mesh edges crossed by segment `a – b`, walking from `a` to `b`; `null` when a vertex lies exactly on
   * the open segment (the constraint should have been split there).
   */
  private crossedEdges(a: number, b: number): [number, number][] | null {
    // Each crossed edge is tracked by its endpoint right of a → b and its endpoint left of it.
    let triangle = NONE;
    let right = NONE;
    let left = NONE;
    for (const t of this.trianglesAround(a)) {
      const k = this.cornerIndex(t, a);
      const u = this.vertex(t, next(k));
      const v = this.vertex(t, prev(k));
      for (const w of [u, v]) {
        if (this.orient(a, b, w) === 0 && this.between(a, b, w)) return null;
      }
      // Triangle (a, u, v) is counter-clockwise, so b's direction lies in it when u is right and v left.
      if (this.orient(a, b, u) < 0 && this.orient(a, b, v) > 0) {
        triangle = t;
        right = u;
        left = v;
        break;
      }
    }
    if (triangle === NONE) return null;

    const crossed: [number, number][] = [];
    for (let guard = 0; guard <= this.alive.length; guard++) {
      crossed.push([right, left]);
      const forward = this.edgeIndex(triangle, right, left);
      const beyond = this.neighbour(triangle, forward !== NONE ? forward : this.edgeIndex(triangle, left, right));
      if (beyond === NONE) return null;
      const w = [0, 1, 2].map((i) => this.vertex(beyond, i)).find((x) => x !== right && x !== left)!;
      if (w === b) return crossed;
      const side = this.orient(a, b, w);
      if (side === 0) return null;
      if (side < 0) right = w;
      else left = w;
      triangle = beyond;
    }
    return null;
  }

  /** Is `p` strictly between `a` and `b` (given collinear)? */
  private between(a: number, b: number, p: number): boolean {
    const pa = this.points[a]!;
    const pb = this.points[b]!;
    const pp = this.points[p]!;
    const d = pb.subtract(pa);
    const t = pp.subtract(pa).dot(d);
    return t > 0 && t < d.dot(d);
  }

  /** Lawson flips until every edge accepted by `check` is locally Delaunay. */
  legalize(check: (u: number, v: number) => boolean): void {
    const stack: [number, number][] = [];
    for (const t of this.liveTriangles()) {
      for (let i = 0; i < 3; i++) stack.push([this.vertex(t, i), this.vertex(t, next(i))]);
    }
    const limit = stack.length * 64 + 1024;
    for (let guard = 0; stack.length > 0 && guard < limit; guard++) {
      const [u, v] = stack.pop()!;
      if (!check(u, v)) continue;
      const at = this.findEdge(u, v);
      if (!at) continue;
      const s = this.neighbour(at.t, at.i);
      if (s === NONE) continue;
      const j = this.edgeIndex(s, this.vertex(at.t, next(at.i)), this.vertex(at.t, at.i));
      const q = this.vertex(s, prev(j));
      if (!this.inCircumcircle(at.t, q)) continue;
      const flipped = this.flip(at.t, at.i);
      if (!flipped) continue;
      const a = this.vertex(flipped.t, 1);
      const c = this.vertex(flipped.s, 1);
      stack.push([flipped.p, a], [a, flipped.q], [flipped.q, c], [c, flipped.p]);
    }
  }
}
