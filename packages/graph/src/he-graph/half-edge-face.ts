import type { HalfEdge } from './half-edge';

/** One polygon face in a half-edge mesh. */
export class HalfEdgeFace<
  TEdgeData extends object = Record<string, never>,
  TFaceData extends object = Record<string, never>,
> {
  constructor(
    public readonly edge: HalfEdge<TEdgeData, TFaceData>,
    public data: TFaceData,
  ) {}
}
