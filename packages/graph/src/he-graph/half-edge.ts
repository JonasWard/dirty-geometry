import type { HalfEdgeFace } from './half-edge-face';

/** Directed edge on one side of a polygon face. */
export class HalfEdge<
  TEdgeData extends object = Record<string, never>,
  TFaceData extends object = Record<string, never>,
> {
  next!: HalfEdge<TEdgeData, TFaceData>;
  prev!: HalfEdge<TEdgeData, TFaceData>;
  twin: HalfEdge<TEdgeData, TFaceData> | null = null;
  face!: HalfEdgeFace<TEdgeData, TFaceData>;

  constructor(
    public readonly origin: number,
    public data: TEdgeData,
  ) {}

  /** Vertex index at the head of this directed edge. */
  destination(): number {
    return this.next.origin;
  }

  /** True when this edge lies on the mesh boundary (no opposite face). */
  isBoundary(): boolean {
    return this.twin === null;
  }

  /** Next outgoing half-edge around `origin` in counter-clockwise order. */
  rotateAroundOrigin(): HalfEdge<TEdgeData, TFaceData> {
    return this.twin?.prev ?? this;
  }

  /** Next incoming half-edge around `destination()` in counter-clockwise order. */
  rotateAroundDestination(): HalfEdge<TEdgeData, TFaceData> {
    return this.next.twin?.next ?? this.next;
  }
}
