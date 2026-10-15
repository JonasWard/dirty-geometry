import { hash2 } from '@dirty-geometry/vec2/hash/core';
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
  const twinBuckets = new Map<number, HalfEdge<TEdgeData, TFaceData>[]>();

  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
    const loop = mesh.faces[faceIndex]!;
    if (loop.length < 3) {
      throw new Error(`Face ${faceIndex} needs at least 3 vertices`);
    }

    const vertexIndices = loop.map((index) => resolveVertexIndex(index, mesh.vertices.length));
    const faceHalfEdges: HalfEdge<TEdgeData, TFaceData>[] = [];

    for (let i = 0; i < vertexIndices.length; i++) {
      const from = vertexIndices[i]!;
      const to = vertexIndices[(i + 1) % vertexIndices.length]!;
      const halfEdge = new HalfEdge<TEdgeData, TFaceData>(from, edgeDataFn({ from, to, faceIndex }));
      faceHalfEdges.push(halfEdge);
      halfEdges.push(halfEdge);

      const key = undirectedEdgeKey(from, to);
      const bucket = twinBuckets.get(key) ?? [];
      bucket.push(halfEdge);
      twinBuckets.set(key, bucket);
    }

    const face = new HalfEdgeFace(faceHalfEdges[0]!, faceDataFn({ faceIndex, vertexIndices }));
    faces.push(face);

    for (let i = 0; i < faceHalfEdges.length; i++) {
      const halfEdge = faceHalfEdges[i]!;
      halfEdge.next = faceHalfEdges[(i + 1) % faceHalfEdges.length]!;
      halfEdge.prev = faceHalfEdges[(i - 1 + faceHalfEdges.length) % faceHalfEdges.length]!;
      halfEdge.face = face;
    }
  }

  for (const bucket of twinBuckets.values()) {
    if (bucket.length === 1) {
      bucket[0]!.twin = null;
      continue;
    }

    if (bucket.length !== 2) {
      throw new Error('Non-manifold edge encountered while building half-edge mesh');
    }

    const [left, right] = bucket;
    if (left!.origin !== right!.destination() || right!.origin !== left!.destination()) {
      throw new Error('Misoriented or non-manifold edge encountered while building half-edge mesh');
    }

    left!.twin = right!;
    right!.twin = left!;
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

function undirectedEdgeKey(a: number, b: number): number {
  return a < b ? hash2(a, b) : hash2(b, a);
}
