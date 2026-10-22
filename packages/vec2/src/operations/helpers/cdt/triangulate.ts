/**
 * Constrained Delaunay triangulation of distinct points with exact predicates.
 *
 * 1. Delaunay: delaunator's sweep-hull (points added in order of distance from the seed circumcentre,
 *    Lawson legalisation on the hull). Its triangles cover the convex hull, so no super triangle is needed.
 * 2. Constraints: Sloan's flip algorithm as in constrainautor. The flips remove every edge a constraint
 *    crosses, the constraint is marked, and the new edges are made locally Delaunay again.
 *
 * Sign convention: triangles are kept in delaunator's orientation, clockwise in y-up coordinates
 * (`clockwise(a, b, c) > 0`, the negative of `Vec2.orient`). They are reversed on output.
 *
 * A constraint is split where it passes through a vertex (exactly, or within `slack`). Crossings between
 * constraints must be split by the caller (see `packSources`). A constraint that cannot be inserted is
 * reported as unresolved; the triangulation stays valid.
 */
import { incircle, orient2d } from 'robust-predicates';
import type { Index, Tolerance } from '../../../core/numbers';
import type { Vec2 } from '../../../core/vec2';
import { assertCdtVertexCount, constraintEdgeEndpoints, type ConstraintEdge } from '../constraint-edge';
import { emptyCdtStats, type CdtStats } from './stats';

/** Result of {@link triangulateConstrained}. */
export type CdtResult = {
  /** Counter-clockwise triangles over the input vertices. */
  triangles: [Index, Index, Index][];
  /** Constraints (as `constraintEdge` keys) that could not be inserted. */
  unresolved: ConstraintEdge[];
  stats: CdtStats;
};

const NONE = -1;
/**
 * Points this close to the previous one in sweep order are skipped (delaunator's near-duplicate test), so
 * exact duplicates are left out of the mesh. `ConstrainedDelaunay` merges points within slack beforehand.
 */
const SWEEP_EPSILON = 2 ** -52;
/** Work budgets that stop a runaway loop; every hit is counted in `stats.guardHits`. */
const FLIP_BUDGET_PER_CROSSING_SQ = 4;
const LEGALIZE_BUDGET_PER_EDGE = 64;
const PIECES_PER_VERTEX = 4;

/** Triangle `t` owns half-edges `3t, 3t + 1, 3t + 2`; `nextE` and `prevE` stay within the triangle. */
const nextE = (e: number) => (e % 3 === 2 ? e - 2 : e + 1);
const prevE = (e: number) => (e % 3 === 0 ? e + 2 : e - 1);

/**
 * Triangles in delaunator's layout: half-edge `e` starts at `triangles[e]` and its twin is `halfedges[e]`
 * (`NONE` on the hull). `constrained` marks both sides of a forced edge; `vertexEdge[v]` is an outgoing
 * half-edge of `v`, or `NONE` for a vertex the sweep left out.
 */
type Mesh = {
  xy: Float64Array;
  triangles: Uint32Array;
  halfedges: Int32Array;
  constrained: Uint8Array;
  vertexEdge: Int32Array;
  stats: CdtStats;
};

/** Constrained Delaunay triangulation of `vertices`, with constraints given as `constraintEdge` keys. */
export function triangulateConstrained(
  vertices: readonly Vec2[],
  constraints: readonly ConstraintEdge[],
  stats: CdtStats = emptyCdtStats(),
  slack: Tolerance = 0,
): CdtResult {
  const { corners, unresolved } = triangulateCorners(vertices, constraints, stats, slack);
  const triangles: [Index, Index, Index][] = [];
  for (let e = 0; e < corners.length; e += 3) triangles.push([corners[e]!, corners[e + 1]!, corners[e + 2]!]);
  return { triangles, unresolved, stats };
}

/**
 * {@link triangulateConstrained} with the triangles as flat corner indices, three per counter-clockwise
 * triangle (the layout `TriMesh2.fromCorners` takes).
 * @internal
 */
export function triangulateCorners(
  vertices: readonly Vec2[],
  constraints: readonly ConstraintEdge[],
  stats: CdtStats,
  slack: Tolerance,
): { corners: Uint32Array; unresolved: ConstraintEdge[] } {
  const n = vertices.length;
  assertCdtVertexCount(n);
  const xy = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    xy[2 * i] = vertices[i]!.x;
    xy[2 * i + 1] = vertices[i]!.y;
  }
  const mesh = n < 3 ? null : sweep(xy, stats);

  const unresolved: ConstraintEdge[] = [];
  for (const key of constraints) {
    const [a, b] = constraintEdgeEndpoints(key);
    // Endpoints come sorted, so checking `b` covers both.
    if (b >= n) throw new RangeError(`Constraint vertex ${b} out of range`);
    if (a === b) continue;
    if (!mesh || !insertConstraint(mesh, slack, a, b)) unresolved.push(key);
  }
  if (!mesh) return { corners: new Uint32Array(0), unresolved };

  // The sweep's triangles are clockwise; swap two corners of each for counter-clockwise output.
  const corners = mesh.triangles;
  for (let e = 0; e < corners.length; e += 3) {
    const second = corners[e + 1]!;
    corners[e + 1] = corners[e + 2]!;
    corners[e + 2] = second;
  }
  return { corners, unresolved };
}

/* ----------------------------------------------------------------------------------------------------------
 * Predicates and small geometry
 * ------------------------------------------------------------------------------------------------------- */

/** Exact `orient2d`: positive when `a → b → c` turns clockwise (y up), as every triangle built here does. */
function clockwise(m: Mesh, a: number, b: number, c: number): number {
  m.stats.orient++;
  const { xy } = m;
  return orient2d(xy[2 * a]!, xy[2 * a + 1]!, xy[2 * b]!, xy[2 * b + 1]!, xy[2 * c]!, xy[2 * c + 1]!);
}

/** Exact: is `d` strictly inside the circumcircle of the clockwise triangle `a, b, c`? */
function inCircumcircle(m: Mesh, a: number, b: number, c: number, d: number): boolean {
  m.stats.inCircle++;
  const { xy } = m;
  return (
    incircle(
      xy[2 * a]!,
      xy[2 * a + 1]!,
      xy[2 * b]!,
      xy[2 * b + 1]!,
      xy[2 * c]!,
      xy[2 * c + 1]!,
      xy[2 * d]!,
      xy[2 * d + 1]!,
    ) < 0
  );
}

/** Strictly opposite signs: the two points lie on opposite sides of the line (or the segment, see callers). */
function opposite(s: number, t: number): boolean {
  return (s > 0 && t < 0) || (s < 0 && t > 0);
}

function circumradius(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const px = (ey * bl - dy * cl) * d;
  const py = (dx * cl - ex * bl) * d;
  return px * px + py * py;
}

function circumcenter(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  return [ax + (ey * bl - dy * cl) * d, ay + (dx * cl - ex * bl) * d];
}

/** Monotonic in the angle of (dx, dy), without trigonometry. */
function pseudoAngle(dx: number, dy: number): number {
  const p = dx / (Math.abs(dx) + Math.abs(dy));
  return (dy > 0 ? 3 - p : 1 + p) / 4;
}

/* ----------------------------------------------------------------------------------------------------------
 * Delaunay: sweep-hull (delaunator)
 * ------------------------------------------------------------------------------------------------------- */

/** Delaunay triangulation of the points, or `null` when there is no non-degenerate triangle. */
function sweep(xy: Float64Array, stats: CdtStats): Mesh | null {
  const n = xy.length >> 1;
  const capacity = 3 * Math.max(2 * n - 5, 0);
  const m: Mesh = {
    xy,
    triangles: new Uint32Array(capacity),
    halfedges: new Int32Array(capacity),
    constrained: new Uint8Array(capacity),
    vertexEdge: new Int32Array(n).fill(NONE),
    stats,
  };
  const x = (i: number) => xy[2 * i]!;
  const y = (i: number) => xy[2 * i + 1]!;

  // Seed: the point nearest the centre, its nearest neighbour, and the point with the smallest circumcircle.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x(i));
    maxX = Math.max(maxX, x(i));
    minY = Math.min(minY, y(i));
    maxY = Math.max(maxY, y(i));
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let i0 = NONE;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (x(i) - cx) ** 2 + (y(i) - cy) ** 2;
    if (d < best) {
      best = d;
      i0 = i;
    }
  }
  let i1 = NONE;
  best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (x(i) - x(i0)) ** 2 + (y(i) - y(i0)) ** 2;
    if (i !== i0 && d > 0 && d < best) {
      best = d;
      i1 = i;
    }
  }
  if (i1 === NONE) return null;
  let i2 = NONE;
  let minRadius = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    const r = circumradius(x(i0), y(i0), x(i1), y(i1), x(i), y(i));
    if (r < minRadius) {
      minRadius = r;
      i2 = i;
    }
  }
  // Collinear input: no seed triangle, so no triangles.
  if (i2 === NONE) return null;
  if (clockwise(m, i0, i1, i2) < 0) [i1, i2] = [i2, i1];

  const [ccx, ccy] = circumcenter(x(i0), y(i0), x(i1), y(i1), x(i2), y(i2));
  const dists = new Float64Array(n);
  for (let i = 0; i < n; i++) dists[i] = (x(i) - ccx) ** 2 + (y(i) - ccy) ** 2;
  const ids = new Uint32Array(n);
  for (let i = 0; i < n; i++) ids[i] = i;
  quicksort(ids, dists, 0, n - 1);

  // Convex hull as a cycle of hull edges, found again through an angular hash.
  const hashSize = Math.ceil(Math.sqrt(n));
  const hullPrev = new Uint32Array(n);
  const hullNext = new Uint32Array(n);
  const hullTri = new Uint32Array(n);
  const hullHash = new Int32Array(hashSize).fill(NONE);
  const hashKey = (px: number, py: number) => Math.floor(pseudoAngle(px - ccx, py - ccy) * hashSize) % hashSize;
  let hullStart = i0;
  let trianglesLen = 0;

  const link = (a: number, b: number) => {
    m.halfedges[a] = b;
    if (b !== NONE) m.halfedges[b] = a;
  };
  const addTriangle = (a: number, b: number, c: number, ab: number, bc: number, ca: number): number => {
    const t = trianglesLen;
    m.triangles[t] = a;
    m.triangles[t + 1] = b;
    m.triangles[t + 2] = c;
    link(t, ab);
    link(t + 1, bc);
    link(t + 2, ca);
    trianglesLen += 3;
    return t;
  };

  // Lawson flips around the new point, from half-edge `a0`; returns the triangle's half-edge opposite the point.
  const stack: number[] = [];
  const legalize = (a0: number): number => {
    let a = a0;
    let ar = 0;
    for (;;) {
      const b = m.halfedges[a]!;
      const aTri = a - (a % 3);
      ar = aTri + ((a + 2) % 3);
      if (b === NONE) {
        const next = stack.pop();
        if (next === undefined) break;
        a = next;
        continue;
      }
      const bTri = b - (b % 3);
      const al = aTri + ((a + 1) % 3);
      const bl = bTri + ((b + 2) % 3);
      const p0 = m.triangles[ar]!;
      const pr = m.triangles[a]!;
      const pl = m.triangles[al]!;
      const p1 = m.triangles[bl]!;
      if (inCircumcircle(m, p0, pr, pl, p1)) {
        m.triangles[a] = p1;
        m.triangles[b] = p0;
        if (m.halfedges[bl] === NONE) {
          // The flipped edge was on the hull: point the hull entry at its new triangle.
          let e = hullStart;
          do {
            if (hullTri[e] === bl) {
              hullTri[e] = a;
              break;
            }
            e = hullPrev[e]!;
          } while (e !== hullStart);
        }
        link(a, m.halfedges[bl]!);
        link(b, m.halfedges[ar]!);
        link(ar, bl);
        stack.push(bTri + ((b + 1) % 3));
      } else {
        const next = stack.pop();
        if (next === undefined) break;
        a = next;
      }
    }
    return ar;
  };

  // Seed triangle.
  hullNext[i0] = i1;
  hullPrev[i2] = i1;
  hullNext[i1] = i2;
  hullPrev[i0] = i2;
  hullNext[i2] = i0;
  hullPrev[i1] = i0;
  hullTri[i0] = 0;
  hullTri[i1] = 1;
  hullTri[i2] = 2;
  hullHash[hashKey(x(i0), y(i0))] = i0;
  hullHash[hashKey(x(i1), y(i1))] = i1;
  hullHash[hashKey(x(i2), y(i2))] = i2;
  addTriangle(i0, i1, i2, NONE, NONE, NONE);

  let xp = NaN;
  let yp = NaN;
  for (let k = 0; k < n; k++) {
    const i = ids[k]!;
    const px = x(i);
    const py = y(i);
    if (k > 0 && Math.abs(px - xp) <= SWEEP_EPSILON && Math.abs(py - yp) <= SWEEP_EPSILON) continue;
    xp = px;
    yp = py;
    if (i === i0 || i === i1 || i === i2) continue;

    // A hull edge visible from the point, found through the hash.
    let start = 0;
    for (let j = 0, key = hashKey(px, py); j < hashSize; j++) {
      start = hullHash[(key + j) % hashSize]!;
      if (start !== NONE && start !== hullNext[start]) break;
    }
    start = hullPrev[start]!;
    let e = start;
    while (clockwise(m, i, e, hullNext[e]!) >= 0) {
      e = hullNext[e]!;
      if (e === start) {
        e = NONE;
        break;
      }
    }
    if (e === NONE) continue; // a near-duplicate point

    // Triangles on the visible side, in both directions along the hull.
    let t = addTriangle(e, i, hullNext[e]!, NONE, NONE, hullTri[e]!);
    hullTri[i] = legalize(t + 2);
    hullTri[e] = t;

    let nn = hullNext[e]!;
    for (let q = hullNext[nn]!; clockwise(m, i, nn, q) < 0; q = hullNext[nn]!) {
      t = addTriangle(nn, i, q, hullTri[i]!, NONE, hullTri[nn]!);
      hullTri[i] = legalize(t + 2);
      hullNext[nn] = nn; // removed from the hull
      nn = q;
    }
    if (e === start) {
      for (let q = hullPrev[e]!; clockwise(m, i, q, e) < 0; q = hullPrev[e]!) {
        t = addTriangle(q, i, e, NONE, hullTri[e]!, hullTri[q]!);
        legalize(t + 2);
        hullTri[q] = t;
        hullNext[e] = e; // removed from the hull
        e = q;
      }
    }

    hullStart = e;
    hullPrev[i] = e;
    hullNext[e] = i;
    hullPrev[nn] = i;
    hullNext[i] = nn;
    hullHash[hashKey(px, py)] = i;
    hullHash[hashKey(x(e), y(e))] = e;
  }

  m.triangles = m.triangles.subarray(0, trianglesLen);
  m.halfedges = m.halfedges.subarray(0, trianglesLen);
  m.constrained = m.constrained.subarray(0, trianglesLen);
  for (let e = 0; e < trianglesLen; e++) m.vertexEdge[m.triangles[e]!] = e;
  return m;
}

/* ----------------------------------------------------------------------------------------------------------
 * Constraints: Sloan's flips (constrainautor)
 * ------------------------------------------------------------------------------------------------------- */

/** One step of inserting a constraint: done, a vertex to split at, or failure. */
type Piece = { kind: 'done' } | { kind: 'split'; at: number } | { kind: 'fail' };
const DONE: Piece = { kind: 'done' };
const FAIL: Piece = { kind: 'fail' };

/** Insert the constraint `a – b`; false when some piece of it cannot be inserted. */
function insertConstraint(m: Mesh, slack: number, a0: number, b0: number): boolean {
  const jobs = [a0, b0];
  const budget = PIECES_PER_VERTEX * m.vertexEdge.length + 64;
  for (let pieces = 0; jobs.length > 0; pieces++) {
    if (pieces > budget) {
      m.stats.guardHits++;
      return false;
    }
    const b = jobs.pop()!;
    const a = jobs.pop()!;
    if (a === b) continue;
    const piece = insertPiece(m, slack, a, b);
    if (piece.kind === 'fail') return false;
    if (piece.kind === 'split') jobs.push(a, piece.at, piece.at, b);
  }
  return true;
}

/** Half-edges leaving vertex `v`, found by turning around it in both directions (around the hull too). */
function outgoing(m: Mesh, v: number): number[] {
  const first = m.vertexEdge[v]!;
  if (first === NONE) return [];
  const out = [first];
  for (let e = first; ; ) {
    const f = m.halfedges[prevE(e)]!;
    if (f === NONE) break;
    if (f === first) return out;
    out.push(f);
    e = f;
  }
  for (let e = first; ; ) {
    const g = m.halfedges[e]!;
    if (g === NONE) break;
    e = nextE(g);
    out.push(e);
  }
  return out;
}

/** A half-edge between `a` and `b` (either direction), or `NONE`; one walk around `a`. */
function edgeBetween(m: Mesh, a: number, b: number): number {
  for (const e of outgoing(m, a)) {
    if (m.triangles[nextE(e)] === b) return e; // a → b
    if (m.triangles[prevE(e)] === b) return prevE(e); // b → a, in the same triangle
  }
  return NONE;
}

function markConstrained(m: Mesh, e: number): void {
  m.constrained[e] = 1;
  const f = m.halfedges[e]!;
  if (f !== NONE) m.constrained[f] = 1;
}

/** Is `p` within `slack` of the open segment `a – b`, or exactly on it? */
function onSegment(m: Mesh, slack: number, a: number, b: number, p: number): boolean {
  const { xy } = m;
  const dx = xy[2 * b]! - xy[2 * a]!;
  const dy = xy[2 * b + 1]! - xy[2 * a + 1]!;
  const px = xy[2 * p]! - xy[2 * a]!;
  const py = xy[2 * p + 1]! - xy[2 * a + 1]!;
  const lengthSq = dx * dx + dy * dy;
  const t = (px * dx + py * dy) / lengthSq;
  if (!(t > 0 && t < 1)) return false;
  if (clockwise(m, a, b, p) === 0) return true;
  return slack > 0 && Math.abs(px * dy - py * dx) <= slack * Math.sqrt(lengthSq);
}

/** Does the segment `a – b` properly cross `p – q`? */
function crosses(m: Mesh, a: number, b: number, p: number, q: number): boolean {
  if (p === a || p === b || q === a || q === b) return false;
  return (
    opposite(clockwise(m, a, b, p), clockwise(m, a, b, q)) && opposite(clockwise(m, p, q, a), clockwise(m, p, q, b))
  );
}

/**
 * One step towards `a – b`. Its own constraints are the cases where a vertex lies on the segment, which
 * splits it; otherwise the edges the segment crosses are collected and flipped away.
 */
function insertPiece(m: Mesh, slack: number, a: number, b: number): Piece {
  const existing = edgeBetween(m, a, b);
  if (existing !== NONE) {
    markConstrained(m, existing);
    return DONE;
  }
  // The triangle around `a` that the segment leaves through: its far edge is the first crossed edge.
  let cone = NONE;
  for (const e of outgoing(m, a)) {
    const x = m.triangles[nextE(e)]!;
    const y = m.triangles[prevE(e)]!;
    if (onSegment(m, slack, a, b, x)) return { kind: 'split', at: x };
    if (onSegment(m, slack, a, b, y)) return { kind: 'split', at: y };
    if (cone === NONE && clockwise(m, a, x, b) > 0 && clockwise(m, a, b, y) > 0) cone = nextE(e);
  }
  if (cone === NONE) return FAIL;
  return walk(m, slack, a, b, cone);
}

/**
 * Walk from `a` through the triangles the segment crosses, to `b`. `h` is the crossed half-edge, from its
 * end `right` of a → b to its end `left` of it. Across `h` lies apex `w`: if `w` is left of the segment the
 * next crossed edge is right – w, otherwise w – left.
 */
function walk(m: Mesh, slack: number, a: number, b: number, first: number): Piece {
  const crossed: number[] = [];
  // Ends of the crossed edge: `right` is on the right of a → b, `left` on the left.
  let right = m.triangles[first]!;
  let left = m.triangles[nextE(first)]!;
  let h = first;
  for (let steps = 0; steps <= m.halfedges.length / 3; steps++) {
    if (m.constrained[h]) return FAIL; // constraints cross
    m.stats.walkSteps++;
    crossed.push(m.triangles[h]!, m.triangles[nextE(h)]!);
    const g = m.halfedges[h]!;
    if (g === NONE) return FAIL; // left the hull
    const w = m.triangles[prevE(g)]!;
    if (w === b) return removeCrossings(m, a, b, crossed);
    if (onSegment(m, slack, a, b, w)) return { kind: 'split', at: w };
    const s = clockwise(m, a, b, w);
    if (s === 0) return FAIL;
    // The next crossed edge joins `w` to the endpoint on the other side of the segment.
    const keep = s > 0 ? right : left;
    h = m.triangles[nextE(g)] === keep ? nextE(g) : prevE(g);
    if (s > 0) left = w;
    else right = w;
  }
  return FAIL;
}

/**
 * Sloan: flip the crossed edges (vertex pairs in `queue`) until `a – b` is an edge. A non-convex quad is
 * retried later; the new diagonals that still cross go back on the queue, the others are legalised.
 */
function removeCrossings(m: Mesh, a: number, b: number, queue: number[]): Piece {
  const budget = FLIP_BUDGET_PER_CROSSING_SQ * (queue.length / 2) ** 2 + 64;
  const fresh: number[] = [];
  let head = 0;
  for (let rounds = 0; head < queue.length; rounds++) {
    if (rounds > budget) {
      m.stats.guardHits++;
      return FAIL;
    }
    const u = queue[head]!;
    const v = queue[head + 1]!;
    head += 2;
    const e = edgeBetween(m, u, v);
    if (e === NONE) continue; // flipped away already
    const f = m.halfedges[e]!;
    if (f === NONE) return FAIL; // a hull edge cannot be crossed
    const p = m.triangles[prevE(e)]!;
    const q = m.triangles[prevE(f)]!;
    if (!opposite(clockwise(m, p, q, u), clockwise(m, p, q, v))) {
      queue.push(u, v);
      continue;
    }
    flip(m, e);
    if (crosses(m, a, b, p, q)) queue.push(p, q);
    else fresh.push(p, q);
  }
  const e = edgeBetween(m, a, b);
  if (e === NONE) return FAIL;
  markConstrained(m, e);
  // Flips rewrite triangle slots, so the new edges were kept as vertex pairs; look them up once now.
  const stack: number[] = [];
  for (let i = 0; i < fresh.length; i += 2) {
    const edge = edgeBetween(m, fresh[i]!, fresh[i + 1]!);
    if (edge !== NONE) stack.push(edge);
  }
  legalize(m, stack);
  return DONE;
}

/**
 * Replace the edge of half-edge `e` (u → v, apexes p and q) by the diagonal p – q. The quad must be convex.
 * The sides keep their constraint flags and outer neighbours.
 */
function flip(m: Mesh, e: number): void {
  const { triangles: T, halfedges: H, constrained: C, vertexEdge: V } = m;
  const f = H[e]!;
  const u = T[e]!;
  const v = T[nextE(e)]!;
  const p = T[prevE(e)]!;
  const q = T[prevE(f)]!;
  const outerPU = H[prevE(e)]!;
  const outerVP = H[nextE(e)]!;
  const outerUQ = H[nextE(f)]!;
  const outerQV = H[prevE(f)]!;
  const flagPU = C[prevE(e)]!;
  const flagVP = C[nextE(e)]!;
  const flagUQ = C[nextE(f)]!;
  const flagQV = C[prevE(f)]!;

  // New triangles (u, q, p) in e's slot and (q, v, p) in f's slot; the diagonal is nextE(e) ↔ prevE(f).
  T[e] = u;
  T[nextE(e)] = q;
  T[prevE(e)] = p;
  T[f] = q;
  T[nextE(f)] = v;
  T[prevE(f)] = p;
  const link = (a: number, b: number) => {
    H[a] = b;
    if (b !== NONE) H[b] = a;
  };
  link(e, outerUQ);
  link(f, outerQV);
  link(prevE(e), outerPU);
  link(nextE(f), outerVP);
  link(nextE(e), prevE(f));
  C[e] = flagUQ;
  C[f] = flagQV;
  C[nextE(f)] = flagVP;
  C[prevE(e)] = flagPU;
  C[nextE(e)] = 0;
  C[prevE(f)] = 0;
  V[u] = e;
  V[q] = f;
  V[v] = nextE(f);
  V[p] = prevE(e);
  m.stats.flips++;
}

/**
 * Lawson flips from the half-edges on `stack` until each unconstrained edge is locally Delaunay. A flip
 * pushes the four sides of its quad; an id that a later flip moved just gets one extra (harmless) test.
 */
function legalize(m: Mesh, stack: number[]): void {
  const { triangles: T, halfedges: H } = m;
  const budget = LEGALIZE_BUDGET_PER_EDGE * stack.length + 1024;
  for (let rounds = 0; stack.length > 0; rounds++) {
    if (rounds > budget) {
      m.stats.guardHits++;
      return;
    }
    const e = stack.pop()!;
    const f = H[e]!;
    if (f === NONE || m.constrained[e]) continue;
    const u = T[e]!;
    const v = T[nextE(e)]!;
    const p = T[prevE(e)]!;
    const q = T[prevE(f)]!;
    if (!inCircumcircle(m, p, u, v, q)) continue;
    if (!opposite(clockwise(m, p, q, u), clockwise(m, p, q, v))) continue;
    flip(m, e);
    // Now (u, q, p) and (q, v, p): the quad's sides are e, prevE(e), f and nextE(f).
    stack.push(e, prevE(e), f, nextE(f));
  }
}

/** Sort `ids[left..right]` by `dists[id]` (delaunator's quicksort; insertion sort on short runs). */
function quicksort(ids: Uint32Array, dists: Float64Array, left: number, right: number): void {
  if (right - left <= 20) {
    for (let i = left + 1; i <= right; i++) {
      const id = ids[i]!;
      const d = dists[id]!;
      let j = i - 1;
      while (j >= left && dists[ids[j]!]! > d) ids[j + 1] = ids[j--]!;
      ids[j + 1] = id;
    }
    return;
  }
  const swap = (a: number, b: number) => {
    const t = ids[a]!;
    ids[a] = ids[b]!;
    ids[b] = t;
  };
  // Median of three as the pivot, kept at left + 1.
  swap((left + right) >> 1, left + 1);
  if (dists[ids[left]!]! > dists[ids[right]!]!) swap(left, right);
  if (dists[ids[left + 1]!]! > dists[ids[right]!]!) swap(left + 1, right);
  if (dists[ids[left]!]! > dists[ids[left + 1]!]!) swap(left, left + 1);
  const pivot = ids[left + 1]!;
  const d = dists[pivot]!;
  let i = left + 1;
  let j = right;
  for (;;) {
    do i++;
    while (dists[ids[i]!]! < d);
    do j--;
    while (dists[ids[j]!]! > d);
    if (j < i) break;
    swap(i, j);
  }
  ids[left + 1] = ids[j]!;
  ids[j] = pivot;
  // Recurse into the smaller side first to bound the stack depth.
  if (right - i + 1 >= j - left) {
    quicksort(ids, dists, i, right);
    quicksort(ids, dists, left, j - 1);
  } else {
    quicksort(ids, dists, left, j - 1);
    quicksort(ids, dists, i, right);
  }
}
