import { test, expect } from 'bun:test';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { NGonMesh } from '../src/he-graph/ngon-mesh';
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

// Two CCW triangles sharing edge 1–2: vertex 1 has outgoing 1→3 (90°) then 1→2 (135°) counter-clockwise.
function twoTriangles() {
  return createFromNGon(
    new NGonMesh(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2(1, 1)],
      [
        [0, 1, 2],
        [1, 3, 2],
      ],
    ),
  );
}

// Centre vertex 4 surrounded by four CCW triangles.
function fan() {
  return createFromNGon(
    new NGonMesh(
      [new Vec2(1, 0), new Vec2(0, 1), new Vec2(-1, 0), new Vec2(0, -1), new Vec2(0, 0)],
      [
        [4, 0, 1],
        [4, 1, 2],
        [4, 2, 3],
        [4, 3, 0],
      ],
    ),
  );
}

const edgeLabel = (edge: { origin: number; destination(): number } | null) =>
  edge ? `${edge.origin}->${edge.destination()}` : null;

test('rotateAroundOrigin steps counter-clockwise to the next outgoing edge (G1)', () => {
  const graph = twoTriangles();
  const find = (from: number, to: number) =>
    graph.halfEdges.find((edge) => edge.origin === from && edge.destination() === to)!;

  expect(edgeLabel(find(1, 3).rotateAroundOrigin())).toBe('1->2');
  expect(find(1, 2).rotateAroundOrigin()).toBeNull();
  expect(edgeLabel(find(1, 2).rotateAroundOriginCw())).toBe('1->3');
});

test('rotateAroundDestination steps counter-clockwise to the next incoming edge (G2)', () => {
  const graph = fan();
  const oneToCentre = graph.halfEdges.find((edge) => edge.origin === 1 && edge.destination() === 4)!;
  expect(edgeLabel(oneToCentre.rotateAroundDestination())).toBe('2->4');
});

test('iterateVertex sweeps every outgoing edge counter-clockwise', () => {
  expect([...twoTriangles().iterateVertex(1)].map(edgeLabel)).toEqual(['1->3', '1->2']);

  const around = [...fan().iterateVertex(4)].map((edge) => edge.destination());
  expect(around).toHaveLength(4);
  const start = around.indexOf(0);
  expect([...around.slice(start), ...around.slice(0, start)]).toEqual([0, 1, 2, 3]);
});

test('createFromNGon rejects loops that repeat a vertex (G10)', () => {
  const vertices = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1), new Vec2(-1, 1)];
  expect(() => createFromNGon(new NGonMesh(vertices, [[0, 1, 1, 2]]))).toThrow('repeats vertex');
  expect(() => createFromNGon(new NGonMesh(vertices, [[0, 1, 2, 0, 3, 4]]))).toThrow('repeats vertex');
});

test('half-edge links are read-only from outside the factory', () => {
  const edge = twoTriangles().halfEdges[0]!;
  expect(() => {
    // @ts-expect-error links are set by the factory only
    edge.next = edge;
  }).toThrow();
});
