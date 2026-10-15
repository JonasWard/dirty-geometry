import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { HalfEdge } from './half-edge';
import type { HalfEdgeFace } from './half-edge-face';

/** Planar polygon mesh stored as a half-edge structure. */
export class HalfEdgeGraph<
  TEdgeData extends object = Record<string, never>,
  TFaceData extends object = Record<string, never>,
> {
  constructor(
    public readonly vertices: readonly Vec2[],
    public readonly halfEdges: readonly HalfEdge<TEdgeData, TFaceData>[],
    public readonly faces: readonly HalfEdgeFace<TEdgeData, TFaceData>[],
  ) {}

  vertex(index: number): Vec2 {
    const vertex = this.vertices[index];
    if (!vertex) throw new Error(`Unknown vertex index ${index}`);
    return vertex;
  }

  /** Half-edges that originate at `index`. */
  halfEdgesFrom(index: number): HalfEdge<TEdgeData, TFaceData>[] {
    return this.halfEdges.filter((halfEdge) => halfEdge.origin === index);
  }

  /** Boundary half-edges (no twin across the mesh border). */
  boundaryHalfEdges(): HalfEdge<TEdgeData, TFaceData>[] {
    return this.halfEdges.filter((halfEdge) => halfEdge.isBoundary());
  }

  /** Vertex indices around a face in boundary order. */
  faceVertexIndices(face: HalfEdgeFace<TEdgeData, TFaceData>): number[] {
    const indices: number[] = [];
    let current = face.edge;
    do {
      indices.push(current.origin);
      current = current.next;
    } while (current !== face.edge);
    return indices;
  }

  /** Iterate half-edges around a face boundary. */
  *iterateFace(face: HalfEdgeFace<TEdgeData, TFaceData>): Generator<HalfEdge<TEdgeData, TFaceData>> {
    let current = face.edge;
    do {
      yield current;
      current = current.next;
    } while (current !== face.edge);
  }

  /** Iterate outgoing half-edges around a vertex in counter-clockwise order. */
  *iterateVertex(index: number): Generator<HalfEdge<TEdgeData, TFaceData>> {
    const first = this.halfEdgesFrom(index)[0];
    if (!first) return;

    let current = first;
    while (true) {
      yield current;
      const next = current.rotateAroundOrigin();
      if (next === first || next === current) break;
      current = next;
    }
  }
}
