import { describe, expect, test } from 'bun:test';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { checkDefinition } from '@dirty-geometry/vec2/schema/typing';
import { arbitraryDefinition } from '../../vec2/test/recording/arbitrary';
import { issuesByNode, nodeKey, outKey, toDefinition, toGraph } from '../src/playground/model/graph';
import { autoLayout, COLUMN, decodeLayout, encodeLayout, remapLayout } from '../src/playground/model/layout';
import { previewOf } from '../src/playground/nodes/preview';
import { STARTERS } from '../src/playground/starters';
import { formatHash, parseHash } from '../src/playground/url';

const starter = (id: string) => STARTERS.find((s) => s.id === id)!.build();
const def = (partial: Partial<Definition>): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs: [],
  functions: [],
  cells: [],
  ...partial,
});

describe('the graph of a definition', () => {
  test.each(STARTERS.map((s) => [s.id, s] as const))('starter %s reads back from its graph', (_, s) => {
    const definition = s.build();
    expect(toDefinition(toGraph(definition))).toEqual(definition);
  });

  test('random definitions read back from their graphs', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const definition = arbitraryDefinition(seed);
      expect(toDefinition(toGraph(definition))).toEqual(definition);
    }
  });

  test('nodes, ports, literals and wires', () => {
    const graph = toGraph(starter('line'));
    expect(graph.nodes.map((n) => n.key)).toEqual(['i:t', 'c:line', 'c:line@args.from', 'c:line@args.to', 'c:point']);
    const from = graph.byKey.get('c:line@args.from')!;
    expect(from.label).toBe('new Vec2');
    expect(from.inputs.map((p) => [p.label, p.literal])).toEqual([
      ['x', -2],
      ['y', -1],
    ]);
    // `line.evaluate(t)`: self from the line cell, t from the input.
    expect(graph.edges.filter((e) => e.target === 'c:point').map((e) => [e.source, e.port])).toEqual([
      ['c:line', 'self'],
      ['i:t', 'args.t'],
    ]);
    expect(graph.byKey.get('c:point')!.cell).toEqual({ name: 'point', output: true, type: 'Vec2' });
  });

  test('a function is a cluster: params, body nodes and an output on a canvas of its own', () => {
    const graph = toGraph(starter('wobbly-ring'));
    const body = graph.nodes.filter((n) => n.canvas === 'fn:onRing').map((n) => n.key);
    expect(body.slice(0, 6)).toEqual([
      'f:onRing#i',
      'f:onRing#previous',
      'f:onRing#n',
      'f:onRing#shape',
      outKey('onRing'),
      nodeKey({ kind: 'function', name: 'onRing' }, []),
    ]);
    expect(graph.byKey.get('c:ring')!.fn).toBe('onRing');
    // A list is a node with one port per item.
    expect(graph.byKey.get('c:ring@data')!.inputs.map((p) => p.key)).toEqual(['0', '1', '2']);
  });

  test('a name that refers to nothing stays on its port', () => {
    const definition = def({ cells: [{ name: 'p', expr: { op: 'Vec2.add', self: { ref: 'nope' } } }] });
    const graph = toGraph(definition);
    expect(graph.byKey.get('c:p')!.inputs.find((p) => p.key === 'self')!.unresolved).toBe('nope');
    expect(toDefinition(graph)).toEqual(definition);
  });

  test('issues land on their port, or on the node above them', () => {
    const definition = def({
      cells: [
        {
          name: 'line',
          expr: {
            op: 'Line2.new',
            args: {
              from: {
                op: 'Circle2.evaluate',
                self: { op: 'Circle2.new', args: { center: { op: 'Vec2.new', args: {} } } },
                args: { theta: 1 },
              },
            },
          },
        },
      ],
    });
    const issues = issuesByNode(toGraph(definition), checkDefinition(definition));
    expect([...issues.get('c:line')!.ports.keys()]).toEqual(['args.to']);
    expect([...issues.get('c:line@args.from.self')!.ports.keys()]).toEqual(['args.radius']);
  });
});

describe('the layout', () => {
  const graph = toGraph(starter('line'));

  test('round-trips through the link, on its grid, shifted to the top left', () => {
    const layout = { 'i:t': { x: 100, y: 52 }, 'c:point': { x: 404, y: 300 } };
    const text = encodeLayout(layout, graph)!;
    expect(decodeLayout(text, graph)).toEqual({ 'i:t': { x: 0, y: 0 }, 'c:point': { x: 300, y: 250 } });
  });

  test('nothing is written without positions; a layout for another graph is dropped', () => {
    expect(encodeLayout({}, graph)).toBeUndefined();
    const text = encodeLayout({ 'i:t': { x: 0, y: 0 } }, graph)!;
    expect(decodeLayout(text, toGraph(starter('star')))).toEqual({});
    expect(decodeLayout('not a layout!', graph)).toEqual({});
    expect(decodeLayout(undefined, graph)).toEqual({});
  });

  test('automatic layout: columns follow the data, stored positions stay', () => {
    const auto = autoLayout(graph, {}, 'main');
    expect([auto['i:t']!.x, auto['c:line@args.from']!.x, auto['c:line']!.x, auto['c:point']!.x]).toEqual([
      0,
      0,
      COLUMN,
      2 * COLUMN,
    ]);
    const kept = autoLayout(graph, { 'c:point': { x: -50, y: 7 } }, 'main');
    expect(kept['c:point']).toEqual({ x: -50, y: 7 });
    // The others go below the stored ones.
    expect(kept['i:t']!.y).toBeGreaterThan(7);
  });

  test('keys move with a renamed or promoted node', () => {
    const layout = { 'c:a': { x: 1, y: 1 }, 'c:a@args.x': { x: 2, y: 2 }, 'c:ab': { x: 3, y: 3 } };
    expect(remapLayout(layout, 'c:a', 'c:b')).toEqual({
      'c:b': { x: 1, y: 1 },
      'c:b@args.x': { x: 2, y: 2 },
      'c:ab': { x: 3, y: 3 },
    });
  });

  test('the link: a layout part after the view part (empty in the editor)', () => {
    expect(formatHash('APP', undefined, 'LAY')).toBe('#/APP//LAY');
    expect(formatHash('APP', 'VIEW', 'LAY')).toBe('#/APP/VIEW/LAY');
    expect(parseHash('#/APP//LAY')).toEqual({ app: 'APP', layout: 'LAY' });
    expect(parseHash('#/APP/VIEW/LAY')).toEqual({ app: 'APP', view: 'VIEW', layout: 'LAY' });
    // Links from before have no layout.
    expect(parseHash('#/APP/VIEW')).toEqual({ app: 'APP', view: 'VIEW' });
    expect(formatHash('APP', 'VIEW')).toBe('#/APP/VIEW');
  });
});

describe('the preview of a node', () => {
  test('an anonymous node runs as a cell of its own, before its cell', () => {
    const definition = starter('line');
    const preview = previewOf(definition, evaluate(definition), 'c:line@args.from')!;
    expect(preview.definition.cells.map((c) => c.name)).toEqual(['preview', 'line', 'point']);
    expect(preview.value).toMatchObject({ x: -2, y: -1 });
  });

  test('a cell or an input is drawn by its name; a function body has nothing to preview', () => {
    const definition = starter('wobbly-ring');
    const evaluation = evaluate(definition);
    expect(previewOf(definition, evaluation, 'c:outline')!.selected).toBe('outline');
    expect(previewOf(definition, evaluation, 'i:points')!.value).toBe(48);
    expect(previewOf(definition, evaluation, 'f:onRing@')).toBeUndefined();
  });
});
