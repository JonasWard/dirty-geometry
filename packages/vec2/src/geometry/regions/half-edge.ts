/**
 * Half-edge stepping for triangles stored as three corners each (`3t, 3t + 1, 3t + 2`), the layout of
 * `TriMesh2` and the CDT. Half-edge `e` runs from corner `e` to corner `nextHalfEdge(e)` of its triangle.
 */
export const nextHalfEdge = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);
export const prevHalfEdge = (e: number): number => (e % 3 === 0 ? e + 2 : e - 1);
