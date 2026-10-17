/** Packed undirected edges between vertex indices, as used by constrained Delaunay. */
import { dehash2, hash2 } from '../../hash/core';

/** Undirected edge key — same `hash2` convention as TriMesh2. */
export type ConstraintEdge = number;
/** Either a packed `ConstraintEdge` or an unordered vertex-index pair. */
export type ConstraintEdgeInput = ConstraintEdge | readonly [number, number];

/** Canonical undirected key for the edge between vertex indices `a` and `b`. */
export function constraintEdge(a: number, b: number): ConstraintEdge {
  return a < b ? hash2(a, b) : hash2(b, a);
}

/** Sorted endpoint indices for a packed constraint edge. */
export function constraintEdgeEndpoints(edge: ConstraintEdge): [number, number] {
  const [x, y] = dehash2(edge);
  return x < y ? [x, y] : [y, x];
}
