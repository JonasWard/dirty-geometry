import { expect, test } from 'bun:test';
import { createRecorder } from '@dirty-geometry/vec2/recording/recorder';
import { recordPlate, PLATE_HOLE_SEGMENTS } from '@dirty-geometry/vec2/examples/definitions/plate';
import { definitionGraph } from '../src/playground/graph';

test('definitionGraph layers nodes by their longest input chain and keeps edge roles', () => {
  const rec = createRecorder();
  const { Vec2, Line2 } = rec.lib;
  const width = rec.param('width', 2);
  const line = new Line2(new Vec2(0, 0), new Vec2(width, 1));
  rec.output('mid', line.evaluate(0.5));

  const graph = definitionGraph(rec.definition());
  expect(graph.nodes.map((node) => [node.label, node.depth])).toEqual([
    ['width', 0],
    ['Vec2(0, 0)', 0],
    ['Vec2(width, 1)', 1],
    ['Line2(·, ·)', 2],
    ['Line2.evaluate(0.5)', 3],
  ]);
  expect(graph.nodes.at(-1)?.outputs).toEqual(['mid']);
  expect(graph.edges.filter((edge) => edge.role === 'self')).toEqual([{ from: 'n2', to: 'n3', role: 'self' }]);
  expect(graph.depth).toBe(4);
});

test('the plate graph has one layer of hole vertices and names its outputs', () => {
  const graph = definitionGraph(recordPlate());
  const evaluations = graph.nodes.filter((node) => node.op === 'Circle2.evaluate');
  expect(evaluations).toHaveLength(PLATE_HOLE_SEGMENTS);
  expect(new Set(evaluations.map((node) => node.depth)).size).toBe(1);
  expect(graph.nodes.filter((node) => node.kind === 'param').map((node) => node.label)).toEqual([
    'width',
    'height',
    'holeRadius',
    'holeX',
  ]);
  expect(graph.nodes.flatMap((node) => node.outputs).sort()).toEqual(['area', 'hole', 'mesh', 'outline', 'plate']);
});
