import type { HalfEdgeFace } from './half-edge-face';

type Links<TEdgeData extends object, TFaceData extends object> = {
  next: HalfEdge<TEdgeData, TFaceData>;
  prev: HalfEdge<TEdgeData, TFaceData>;
  twin: HalfEdge<TEdgeData, TFaceData> | null;
  face: HalfEdgeFace<TEdgeData, TFaceData>;
};

/**
 * Directed edge on one side of a polygon face.
 * Rotation helpers assume counter-clockwise faces, as {@link createFromNGon} expects.
 */
export class HalfEdge<
  TEdgeData extends object = Record<string, never>,
  TFaceData extends object = Record<string, never>,
> {
  private _next!: HalfEdge<TEdgeData, TFaceData>;
  private _prev!: HalfEdge<TEdgeData, TFaceData>;
  private _twin: HalfEdge<TEdgeData, TFaceData> | null = null;
  private _face!: HalfEdgeFace<TEdgeData, TFaceData>;

  constructor(
    public readonly origin: number,
    public data: TEdgeData,
  ) {}

  /** Next half-edge around the same face. */
  get next(): HalfEdge<TEdgeData, TFaceData> {
    return this._next;
  }

  /** Previous half-edge around the same face. */
  get prev(): HalfEdge<TEdgeData, TFaceData> {
    return this._prev;
  }

  /** Opposite half-edge on the neighbouring face; `null` on the mesh boundary. */
  get twin(): HalfEdge<TEdgeData, TFaceData> | null {
    return this._twin;
  }

  get face(): HalfEdgeFace<TEdgeData, TFaceData> {
    return this._face;
  }

  /** Set connectivity; used by the factory while building a mesh. */
  static link<TEdgeData extends object, TFaceData extends object>(
    edge: HalfEdge<TEdgeData, TFaceData>,
    links: Partial<Links<TEdgeData, TFaceData>>,
  ): void {
    if (links.next !== undefined) edge._next = links.next;
    if (links.prev !== undefined) edge._prev = links.prev;
    if (links.twin !== undefined) edge._twin = links.twin;
    if (links.face !== undefined) edge._face = links.face;
  }

  /** Vertex index at the head of this directed edge. */
  destination(): number {
    return this.next.origin;
  }

  /** True when this edge lies on the mesh boundary (no opposite face). */
  isBoundary(): boolean {
    return this.twin === null;
  }

  /** Next outgoing half-edge around `origin`, counter-clockwise; `null` when a boundary is reached. */
  rotateAroundOrigin(): HalfEdge<TEdgeData, TFaceData> | null {
    return this.prev.twin;
  }

  /** Next outgoing half-edge around `origin`, clockwise; `null` when a boundary is reached. */
  rotateAroundOriginCw(): HalfEdge<TEdgeData, TFaceData> | null {
    return this.twin?.next ?? null;
  }

  /** Next incoming half-edge around `destination()`, counter-clockwise; `null` when a boundary is reached. */
  rotateAroundDestination(): HalfEdge<TEdgeData, TFaceData> | null {
    return this.twin?.prev ?? null;
  }
}
