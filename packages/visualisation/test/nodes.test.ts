import { describe, expect, test } from 'bun:test';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { checkDefinition } from '@dirty-geometry/vec2/schema/typing';
import { arbitraryDefinition } from '../../vec2/test/recording/arbitrary';
import { issuesByNode, nodeKey, outKey, toDefinition, toGraph } from '../src/playground/model/graph';
import * as edits from '../src/playground/model/graph-edits';
import { isDoubleTap, selectionActions } from '../src/playground/model/selection';
import { autoLayout, COLUMN, decodeLayout, encodeLayout, remapLayout } from '../src/playground/model/layout';
import { browsePalette, freshOp, paletteEntries, searchPalette } from '../src/playground/nodes/Palette';
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

describe('editing in the node view', () => {
  const doc = () => ({ definition: starter('line'), layout: {} as Record<string, { x: number; y: number }> });
  const issues = (d: Definition) => checkDefinition(d).issues.map((i) => i.message);

  test('a node added and wired into one port goes inside it, with its position', () => {
    const added = edits.addNode(doc(), { op: 'Vec2.new', args: { x: 5, y: 5 } }, { x: 10, y: 20 });
    expect(added.key).toBe('c:vec2');
    const wired = edits.connect(added, added.key, 'c:line', 'args.to');
    const line = wired.definition.cells.find((c) => c.name === 'line')!;
    expect(line.expr).toMatchObject({ args: { to: { op: 'Vec2.new', args: { x: 5, y: 5 } } } });
    expect(wired.layout).toMatchObject({ 'c:line@args.to': { x: 10, y: 20 } });
    // What the port held before stays on the canvas, as a cell of its own.
    expect(wired.definition.cells.map((c) => c.name)).toEqual(['vec2_2', 'line', 'point']);
    expect(issues(wired.definition)).toEqual([]);
  });

  test('a node wired into a second port becomes a cell, before the cell that now uses it', () => {
    const d = edits.addNode(doc(), { op: 'Circle2.new', args: { radius: 1 } }, { x: 0, y: 0 });
    const wired = edits.connect(d, 'c:line@args.from', 'c:circle2', 'args.center');
    expect(wired.definition.cells.map((c) => c.name)).toEqual(['vec2', 'line', 'point', 'circle2']);
    expect(wired.definition.cells.find((c) => c.name === 'circle2')!.expr).toMatchObject({
      args: { center: { ref: 'vec2' } },
    });
    expect(issues(wired.definition)).toEqual([]);
  });

  test('a later cell moves up when an earlier one starts to use it', () => {
    const d = edits.addNode(doc(), { op: 'Vec2.new', args: { x: 1, y: 1 } }, { x: 0, y: 0 });
    const named = edits.nameNode(d, 'c:vec2', 'corner');
    const kept = edits.connect(
      edits.connect(named, 'c:corner', 'c:line', 'args.to'),
      'c:corner',
      'c:line',
      'args.from',
    );
    expect(kept.definition.cells.map((c) => c.name)).toEqual(['vec2', 'corner', 'vec2_2', 'line', 'point']);
    expect(issues(kept.definition)).toEqual([]);
  });

  test('loops and types that do not fit are refused', () => {
    expect(() => edits.connect(doc(), 'c:point', 'c:line', 'args.from')).toThrow('loop');
    expect(() => edits.connect(doc(), 'c:line', 'c:line@args.from', 'args.x')).toThrow('loop');
    expect(() => edits.connect(doc(), 'i:t', 'c:line', 'args.from')).toThrow('takes Vec2');
  });

  test('a wire removed: the port is empty, an anonymous node stays as a cell', () => {
    const cut = edits.disconnect(doc(), 'c:line', 'args.from');
    expect(cut.definition.cells.map((c) => c.name)).toEqual(['vec2', 'line', 'point']);
    expect(issues(cut.definition)).toEqual(['Line2.new: from is missing']);
  });

  test('literals on ports, rest items, names and outputs', () => {
    let d: edits.GraphDoc = doc();
    d = edits.setPortLiteral(d, 'c:line@args.from', 'args.x', 7);
    expect(d.definition.cells[0]!.expr).toMatchObject({ args: { from: { args: { x: 7 } } } });
    d = edits.addNode(d, { op: 'Aabb2.fromPoints' }, { x: 0, y: 0 });
    d = edits.addRestItem(d, 'c:fromPoints', 'points');
    expect(
      toGraph(d.definition)
        .byKey.get('c:fromPoints')!
        .inputs.map((p) => p.label),
    ).toEqual(['points[0]']);
    d = edits.nameNode(d, 'c:line@args.to', 'end');
    expect(d.definition.cells.map((c) => c.name)).toEqual(['end', 'line', 'point', 'fromPoints']);
    d = edits.setOutput(d, 'c:end', true);
    expect(d.definition.cells[0]).toMatchObject({ name: 'end', output: true, type: 'Vec2' });
  });

  test('deleting: a cell leaves empty ports where it was used; an input leaves its value', () => {
    const gone = edits.deleteNode(doc(), 'c:line');
    expect(gone.definition.cells.map((c) => c.name)).toEqual(['point']);
    expect(issues(gone.definition)).toEqual(['the Line2 is missing']);
    const noInput = edits.deleteNode(doc(), 'i:t');
    expect(noInput.definition.cells[1]!.expr).toMatchObject({ args: { t: 0.25 } });
    expect(() => edits.deleteNode({ definition: starter('star'), layout: {} }, 'f:rim#circle')).toThrow('cluster');
  });

  test('every edit keeps the graph readable both ways', () => {
    let d: edits.GraphDoc = { definition: starter('wobbly-ring'), layout: {} };
    d = edits.disconnect(d, 'c:kept', 'items');
    d = edits.connect(d, 'c:ring', 'c:kept', 'items');
    expect(toDefinition(toGraph(d.definition))).toEqual(d.definition);
    expect(issues(d.definition)).toEqual([]);
  });
});

describe('clusters', () => {
  const same = (a: Definition, b: Definition) => expect(evaluate(a).outputs).toEqual(evaluate(b).outputs);

  test('selected nodes become a function; wires coming in become its params; the outputs stay the same', () => {
    const before = starter('line');
    const made = edits.makeCluster({ definition: before, layout: {} }, ['i:t', 'c:line', 'c:line@args.from']);
    expect(made.definition.functions).toEqual([
      {
        name: 'cluster',
        params: [{ name: 'to', type: 'Vec2' }],
        body: { op: 'Line2.new', args: { from: { op: 'Vec2.new', args: { x: -2, y: -1 } }, to: { ref: 'to' } } },
      },
    ]);
    expect(made.definition.cells[0]!.expr).toEqual({
      call: 'cluster',
      args: { to: { op: 'Vec2.new', args: { x: 3, y: 2 } } },
    });
    expect(checkDefinition(made.definition).issues).toEqual([]);
    same(made.definition, before);
  });

  test('selected cells are folded in; inputs and other cells become params', () => {
    const before = starter('wobbly-ring');
    const made = edits.makeCluster({ definition: before, layout: {} }, ['c:kept', 'c:kept@items']);
    expect(made.definition.functions.at(-1)!.params).toEqual([
      { name: 'ring', type: 'Vec2[]' },
      { name: 'cut', type: 'Coordinate' },
    ]);
    same(made.definition, before);
    const star = starter('star');
    // The star cell with every node inside it, and the outer circle it uses.
    const keys = toGraph(star)
      .nodes.map((n) => n.key)
      .filter((k) => k === 'c:outer' || k.startsWith('c:star'));
    const two = edits.makeCluster({ definition: star, layout: {} }, keys);
    expect(two.definition.cells.map((c) => c.name)).toEqual(['inner', 'star', 'area']);
    same(two.definition, star);
  });

  test('a selection with more than one result, or a cell used elsewhere, is refused', () => {
    expect(() => edits.makeCluster({ definition: starter('star'), layout: {} }, ['c:outer', 'c:inner'])).toThrow(
      'one result',
    );
    expect(() =>
      edits.makeCluster({ definition: starter('line'), layout: {} }, ['c:line@args.from', 'c:point']),
    ).toThrow('one result');
  });

  test('dissolving puts the body back; params can be added, renamed, retyped and removed', () => {
    const before = starter('line');
    let d: edits.GraphDoc = edits.makeCluster({ definition: before, layout: {} }, ['c:line', 'c:line@args.from']);
    d = edits.renameClusterParam(d, 'cluster', 'to', 'end');
    expect(d.definition.cells[0]!.expr).toMatchObject({ call: 'cluster', args: { end: {} } });
    d = edits.addClusterParam(d, 'cluster', 'Length');
    expect(d.definition.functions[0]!.params.map((p) => p.name)).toEqual(['end', 'x']);
    d = edits.setClusterParamType(d, 'cluster', 'x', 'Coordinate');
    d = edits.removeClusterParam(d, 'cluster', 'x');
    d = edits.renameCluster(d, 'cluster', 'segment');
    expect(d.definition.cells[0]!.expr).toMatchObject({ call: 'segment' });
    const back = edits.dissolveCluster(d, 'segment');
    expect(back.definition).toEqual(before);
  });

  test('a node dragged out of an input goes into it, also inside a cluster', () => {
    const d = edits.insertNode(
      { definition: starter('wobbly-ring'), layout: {} },
      'f:onRing@args.theta',
      'args.0',
      { math: 'sin', args: [0] },
      { x: 5, y: 5 },
    );
    const onRing = d.definition.functions[0]!;
    expect((onRing.body as unknown as { args: { theta: { args: unknown[] } } }).args.theta.args[0]).toEqual({
      math: 'sin',
      args: [0],
    });
    expect(d.layout).toEqual({ 'f:onRing@args.theta.args.0': { x: 5, y: 5 } });
  });
});

describe('the node search', () => {
  const all = paletteEntries(starter('wobbly-ring'), []);
  test('a name that is the query comes first; every word must match', () => {
    expect(searchPalette(all, 'sin', 1)[0]!.label).toBe('sin(x)');
    expect(searchPalette(all, 'circle2 new', 1)[0]!.label).toBe('new Circle2');
    expect(searchPalette(all, 'onRing')[0]).toMatchObject({ group: 'Clusters', expr: { call: 'onRing' } });
    expect(searchPalette(all, 'map').some((e) => e.group === 'Lists')).toBe(true);
    expect(searchPalette(all, 'zzzz')).toEqual([]);
  });
  test('a new operation node starts with its number arguments set', () => {
    expect(freshOp('Circle2.new')).toEqual({ op: 'Circle2.new', args: { radius: 1 } });
  });
});

describe('touch: what the toolbar offers, and double taps', () => {
  const graph = toGraph(starter('wobbly-ring'));

  test('one node: delete, name, output, and open when it calls a cluster', () => {
    expect(selectionActions(graph, ['c:ring'], null)).toMatchObject({
      kind: 'node',
      canDelete: true,
      canName: true,
      canOutput: true,
      open: 'onRing',
    });
    expect(selectionActions(graph, ['i:points'], null)).toMatchObject({ canName: true, canOutput: false });
    // A cluster's own params and output are changed in the cluster's tools, not deleted.
    expect(selectionActions(graph, ['f:onRing#i'], null)).toMatchObject({ canDelete: false, canName: true });
    expect(selectionActions(graph, [outKey('onRing')], null)).toMatchObject({ canDelete: false, canName: false });
  });

  test('several nodes: make a cluster (main canvas only); a wire: remove it; nothing: nothing', () => {
    expect(selectionActions(graph, ['c:kept', 'c:kept@items'], null)).toMatchObject({
      kind: 'nodes',
      canCluster: true,
    });
    expect(selectionActions(graph, ['f:onRing@', 'f:onRing@self'], null).canCluster).toBe(false);
    expect(selectionActions(graph, [], 'c:outline:args.vertices')).toMatchObject({ kind: 'edge', canDelete: true });
    expect(selectionActions(graph, [], null).kind).toBe('none');
  });

  test('a double tap: close in time and place, measured by the events themselves', () => {
    const first = { time: 1000, x: 10, y: 10 };
    expect(isDoubleTap(first, { time: 1250, x: 14, y: 12 })).toBe(true);
    expect(isDoubleTap(first, { time: 1500, x: 10, y: 10 })).toBe(false);
    expect(isDoubleTap(first, { time: 1100, x: 80, y: 10 })).toBe(false);
    expect(isDoubleTap(null, first)).toBe(false);
  });
});

describe('starting clusters', () => {
  test('one node can be made a cluster too', () => {
    const graph = toGraph(starter('line'));
    expect(selectionActions(graph, ['c:line'], null).canCluster).toBe(true);
    expect(selectionActions(graph, ['i:t'], null).canCluster).toBe(false);
  });
  test('+ cluster: an empty one to fill, whose result is its param', () => {
    const made = edits.newCluster({ definition: starter('line'), layout: {} });
    expect(made.name).toBe('cluster');
    expect(made.definition.functions.at(-1)).toEqual({
      name: 'cluster',
      params: [{ name: 'x', type: 'Coordinate' }],
      body: { ref: 'x' },
    });
    expect(edits.newCluster(made).name).toBe('cluster2');
  });
});

describe('browsing the node search without typing', () => {
  const all = paletteEntries(starter('wobbly-ring'), []);
  const favourites = ['Vec2.new', 'Circle2.new'];
  const groupsOf = (list: { group: string }[]) => [...new Set(list.map((e) => e.group))];

  test('an empty search shows every small group, and only the favourite operations', () => {
    const { entries, moreOperations } = browsePalette(all, '', null, favourites);
    expect(groupsOf(entries)).toEqual([
      'Clusters',
      'Math',
      'Lists',
      'Logic',
      'Random',
      'Values',
      'Inputs',
      'Operations',
    ]);
    expect(entries.filter((e) => e.group === 'Operations').map((e) => e.label)).toEqual(['new Circle2', 'new Vec2']);
    expect(moreOperations).toBeGreaterThan(400);
  });

  test('a group shows in full; a query narrows within it', () => {
    const math = browsePalette(all, '', 'Math', favourites).entries;
    expect(math.every((e) => e.group === 'Math')).toBe(true);
    expect(math.map((e) => e.label)).toEqual(expect.arrayContaining(['sin(x)', 'atan2(y, x)', 'log10(x)', 'x + y']));
    expect(math.length).toBe(all.filter((e) => e.group === 'Math').length);
    expect(browsePalette(all, 'log', 'Math', favourites).entries.map((e) => e.label)).toEqual(['log2(x)', 'log10(x)']);
    expect(browsePalette(all, '', 'Operations', favourites).entries.length).toBe(
      all.filter((e) => e.group === 'Operations').length,
    );
  });
});
