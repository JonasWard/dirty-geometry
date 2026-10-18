/** Packed undirected edges between vertex indices, as used by constrained Delaunay. */
import type { Index } from '../../core/numbers';
import { dehash2, hash2 } from '../../hash/core';

/** Undirected edge key — same `hash2` convention as TriMesh2. */
export type ConstraintEdge = Index;
/** Either a packed `ConstraintEdge` or an unordered vertex-index pair. */
export type ConstraintEdgeInput = ConstraintEdge | readonly [Index, Index];

/** Canonical undirected key for the edge between vertex indices `a` and `b`. */
export function constraintEdge(a: Index, b: Index): ConstraintEdge {
  return a < b ? hash2(a, b) : hash2(b, a);
}

/** Sorted endpoint indices for a packed constraint edge. */
export function constraintEdgeEndpoints(edge: ConstraintEdge): [number, number] {
  const [x, y] = dehash2(edge);
  return x < y ? [x, y] : [y, x];
}
