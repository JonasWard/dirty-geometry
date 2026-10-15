import { test, expect } from 'bun:test';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { NGonMesh } from '@dirty-geometry/vec2/geometry/regions/ngon-mesh';
import { createFromNGon } from '../src/he-graph/factory';

test('createFromNGon builds twins and face loops for two quads', () => {
  const mesh = new NGonMesh(
    [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1), new Vec2(2, 0), new Vec2(2, 1)],
    [
      [0, 1, 2, 3],
      [1, 4, 5, 2],
    ],
  );

  const graph = createFromNGon(mesh, {
    edgeData: ({ from, to }) => ({ from, to }),
    faceData: ({ faceIndex }) => ({ id: `face-${faceIndex}` }),
  });

  expect(graph.vertices).toHaveLength(6);
  expect(graph.faces).toHaveLength(2);
  expect(graph.halfEdges).toHaveLength(8);

  const shared = graph.halfEdges.filter((halfEdge) => halfEdge.origin === 1 && halfEdge.destination() === 2);
  expect(shared).toHaveLength(1);
  expect(shared[0]!.twin).not.toBeNull();
  expect(shared[0]!.twin!.origin).toBe(2);
  expect(shared[0]!.twin!.destination()).toBe(1);

  expect(graph.faceVertexIndices(graph.faces[0]!)).toEqual([0, 1, 2, 3]);
  expect(graph.faces[0]!.data).toEqual({ id: 'face-0' });
  expect(shared[0]!.data).toEqual({ from: 1, to: 2 });

  const boundary = graph.boundaryHalfEdges();
  expect(boundary).toHaveLength(6);
});

test('createFromNGon rejects non-manifold edges', () => {
  const mesh = new NGonMesh(
    [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0.5, 1)],
    [
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ],
  );

  expect(() => createFromNGon(mesh)).toThrow('Non-manifold edge');
});
