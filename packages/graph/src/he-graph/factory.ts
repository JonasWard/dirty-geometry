import type { NGonMesh } from './ngon-mesh';
import { HalfEdge } from './half-edge';
import { HalfEdgeFace } from './half-edge-face';
import { HalfEdgeGraph } from './half-edge-graph';

export type CreateFromNGonEdgeContext = {
  from: number;
  to: number;
  faceIndex: number;
};

export type CreateFromNGonFaceContext = {
  faceIndex: number;
  vertexIndices: readonly number[];
};

export type CreateFromNGonOptions<
  TEdgeData extends object = Record<string, never>,
  TFaceData extends object = Record<string, never>,
> = {
  edgeData?: (edge: CreateFromNGonEdgeContext) => TEdgeData;
  faceData?: (face: CreateFromNGonFaceContext) => TFaceData;
};

export function createFromNGon<
  TEdgeData extends object = Record<string, never>,
  TFaceData extends object = Record<string, never>,
>(mesh: NGonMesh, options: CreateFromNGonOptions<TEdgeData, TFaceData> = {}): HalfEdgeGraph<TEdgeData, TFaceData> {
  const edgeDataFn = options.edgeData ?? (() => ({}) as TEdgeData);
  const faceDataFn = options.faceData ?? (() => ({}) as TFaceData);

  const faces: HalfEdgeFace<TEdgeData, TFaceData>[] = [];
  const halfEdges: HalfEdge<TEdgeData, TFaceData>[] = [];
  // Undirected edge (low index → high index) → the half-edges along it.
  const twinBuckets = new Map<number, Map<number, HalfEdge<TEdgeData, TFaceData>[]>>();

  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
    const loop = mesh.faces[faceIndex]!;
    if (loop.length < 3) {
      throw new Error(`Face ${faceIndex} needs at least 3 vertices`);
    }

    const vertexIndices = loop.map((index) => resolveVertexIndex(index, mesh.vertices.length));
    if (new Set(vertexIndices).size !== vertexIndices.length) {
      throw new Error(`Face ${faceIndex} repeats vertex indices (zero-length or pinched loop)`);
    }
    const faceHalfEdges: HalfEdge<TEdgeData, TFaceData>[] = [];

    for (let i = 0; i < vertexIndices.length; i++) {
      const from = vertexIndices[i]!;
      const to = vertexIndices[(i + 1) % vertexIndices.length]!;
      const halfEdge = new HalfEdge<TEdgeData, TFaceData>(from, edgeDataFn({ from, to, faceIndex }));
      faceHalfEdges.push(halfEdge);
      halfEdges.push(halfEdge);

      const [low, high] = from < to ? [from, to] : [to, from];
      const byHigh = twinBuckets.get(low) ?? new Map<number, HalfEdge<TEdgeData, TFaceData>[]>();
      twinBuckets.set(low, byHigh);
      const bucket = byHigh.get(high) ?? [];
      bucket.push(halfEdge);
      byHigh.set(high, bucket);
    }

    const face = new HalfEdgeFace(faceHalfEdges[0]!, faceDataFn({ faceIndex, vertexIndices }));
    faces.push(face);

    for (let i = 0; i < faceHalfEdges.length; i++) {
      HalfEdge.link(faceHalfEdges[i]!, {
        next: faceHalfEdges[(i + 1) % faceHalfEdges.length]!,
        prev: faceHalfEdges[(i - 1 + faceHalfEdges.length) % faceHalfEdges.length]!,
        face,
      });
    }
  }

  for (const bucket of [...twinBuckets.values()].flatMap((byHigh) => [...byHigh.values()])) {
    if (bucket.length === 1) continue;

    if (bucket.length !== 2) {
      throw new Error('Non-manifold edge encountered while building half-edge mesh');
    }

    const [left, right] = bucket;
    if (left!.origin !== right!.destination() || right!.origin !== left!.destination()) {
      throw new Error('Misoriented or non-manifold edge encountered while building half-edge mesh');
    }

    HalfEdge.link(left!, { twin: right! });
    HalfEdge.link(right!, { twin: left! });
  }

  return new HalfEdgeGraph(
    mesh.vertices.map((vertex) => vertex.clone()),
    halfEdges,
    faces,
  );
}

function resolveVertexIndex(index: number, vertexCount: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
    throw new Error(`Invalid vertex index ${index}`);
  }
  return index;
}
