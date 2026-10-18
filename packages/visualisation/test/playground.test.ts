import { describe, expect, test } from 'bun:test';
import type { Definition, Expr } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { defaultRegistry } from '@dirty-geometry/vec2/io/default-registry';
import { operationById } from '@dirty-geometry/vec2/schema/schema';
import { checkDefinition, typer, widen } from '@dirty-geometry/vec2/schema/typing';
import { DEFAULT_VALUES } from '../src/playground/defaults';
import * as ops from '../src/playground/model/ops';
import { OPERATION_GROUPS } from '../src/playground/operations';
import { STARTERS } from '../src/playground/starters';
import { createPlaygroundStore } from '../src/playground/store';

const def = (partial: Partial<Definition>): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs: [],
  functions: [],
  cells: [],
  ...partial,
});
const vec = (x: Expr, y: Expr): Expr => ({ op: 'Vec2.new', args: { x, y } });
const base = def({
  inputs: [{ name: 'w', type: 'Coordinate', value: 2 }],
  cells: [
    { name: 'a', expr: vec({ ref: 'w' }, 0) },
    { name: 'b', expr: { op: 'Vec2.add', self: { ref: 'a' }, args: { other: { ref: 'a' } } }, output: true },
  ],
});
const typeOf = (d: Definition) => (e: Expr) =>
  widen(typer([], 'cell', '').typeOf(e, { refs: checkDefinition(d).refs, fns: checkDefinition(d).fns }));
const outputs = (d: Definition) =>
  JSON.parse(JSON.stringify(evaluate(d).outputs, (_, v) => (v?.toJson ? v.toJson() : v)));

describe('playground data', () => {
  test('every curated operation exists', () => {
    expect(OPERATION_GROUPS.flatMap((g) => g.ops).filter((id) => !operationById.has(id))).toEqual([]);
  });
  test('every default value decodes', () => {
    for (const json of Object.values(DEFAULT_VALUES)) expect(() => defaultRegistry.decode(json)).not.toThrow();
  });
  test.each(STARTERS.map((s) => [s.id, s] as const))('starter %s type-checks and evaluates', (_, starter) => {
    const definition = starter.build();
    expect(checkDefinition(definition).issues).toEqual([]);
    expect([...evaluate(definition).cells.values()].filter((r) => 'error' in r)).toEqual([]);
  });
});

describe('editing', () => {
  test('renaming rewrites every use; names must be free and valid', () => {
    const renamed = ops.rename(base, 'a', 'start');
    expect(renamed.cells[1]!.expr).toEqual({
      op: 'Vec2.add',
      self: { ref: 'start' },
      args: { other: { ref: 'start' } },
    });
    expect(ops.rename(base, 'w', 'width').cells[0]!.expr).toEqual(vec({ ref: 'width' }, 0));
    expect(() => ops.rename(base, 'a', 'b')).toThrow(/already used/);
    expect(() => ops.rename(base, 'a', 'Vec2')).toThrow(/vec2 name/);
    expect(() => ops.rename(base, 'a', 'new')).toThrow(/reserved/);
  });

  test('removing a cell writes it into its uses; removing an input writes its value', () => {
    const without = ops.removeCell(base, 'a');
    expect(without.cells.map((c) => c.name)).toEqual(['b']);
    expect(outputs(without)).toEqual(outputs(base));
    const noInput = ops.removeInput(base, 'w');
    expect(noInput.cells[0]!.expr).toEqual(vec(2, 0));
    expect(outputs(noInput)).toEqual(outputs(base));
  });

  test('extracting an expression makes a cell before it, and is undone by removing that cell', () => {
    const extracted = ops.extractCell(base, 'b', ['args', 'other']);
    expect(extracted.cells.map((c) => c.name)).toEqual(['a', 'other', 'b']);
    expect(extracted.cells[1]).toEqual({ name: 'other', expr: { ref: 'a' } });
    const nested = def({ cells: [{ name: 'c', expr: { op: 'Circle2.new', args: { center: vec(1, 2), radius: 1 } } }] });
    const first = ops.extractCell(nested, 'c', ['args', 'center']);
    expect(first.cells.map((c) => [c.name, c.expr])).toEqual([
      ['vec2', vec(1, 2)],
      ['c', { op: 'Circle2.new', args: { center: { ref: 'vec2' }, radius: 1 } }],
    ]);
    expect(ops.removeCell(first, 'vec2')).toEqual(nested);
  });

  test('a cell cannot move past what it uses', () => {
    expect(() => ops.moveCell(base, 'b', -1)).toThrow(/b uses a/);
    const free = ops.addCell(base, vec(1, 1), { name: 'c' });
    expect(ops.moveCell(free, 'c', -1).cells.map((c) => c.name)).toEqual(['a', 'c', 'b']);
  });

  test('changing an operation keeps the arguments that still fit and puts the old expression in', () => {
    const scope = ops.scopeOf(base, 'b');
    const t = typeOf(base);
    expect(ops.changeOp(vec(1, 2), 'Vec2.subtract', scope, t)).toEqual({
      op: 'Vec2.subtract',
      self: vec(1, 2),
      args: { other: { ref: 'a' } },
    });
    expect(
      ops.changeOp({ op: 'Vec2.add', self: { ref: 'a' }, args: { other: vec(1, 1) } }, 'Vec2.subtract', scope, t),
    ).toEqual({
      op: 'Vec2.subtract',
      self: { ref: 'a' },
      args: { other: vec(1, 1) },
    });
    expect(ops.changeOp({ ref: 'a' }, 'Circle2.new', scope, t)).toEqual({
      op: 'Circle2.new',
      args: { center: { ref: 'a' }, radius: { ref: 'w' } },
    });
  });

  test('functions: calls, params and removal', () => {
    let d = ops.addFunction(base);
    expect(d.functions).toEqual([{ name: 'f', params: [{ name: 'x', type: 'Coordinate' }], body: { ref: 'x' } }]);
    d = ops.setFunctionBody(d, 'f', [], vec({ ref: 'x' }, { ref: 'x' }));
    d = ops.setCellExpr(d, 'a', [], ops.callFunction(undefined, d.functions[0]!, ops.scopeOf(d, 'a'), typeOf(d)));
    expect(d.cells[0]!.expr).toEqual({ call: 'f', args: { x: { ref: 'w' } } });
    expect(checkDefinition(d).issues).toEqual([]);
    d = ops.renameParam(d, 'f', 'x', 'size');
    expect(d.cells[0]!.expr).toEqual({ call: 'f', args: { size: { ref: 'w' } } });
    d = ops.addParam(d, 'f', 'Length');
    expect(d.cells[0]!.expr).toEqual({ call: 'f', args: { size: { ref: 'w' }, x: 1 } });
    const withFn = d;
    d = ops.removeParam(d, 'f', 'x');
    expect(d.functions[0]!.params.map((p) => p.name)).toEqual(['size']);
    const inlined = ops.removeFunction(withFn, 'f');
    expect(inlined.functions).toEqual([]);
    expect(inlined.cells[0]!.expr).toEqual(vec({ ref: 'w' }, { ref: 'w' }));
    expect(outputs(inlined)).toEqual(outputs(withFn));
  });

  test('arguments can be set, left out and listed', () => {
    let d = ops.setCellExpr(base, 'a', ['args', 'y'], undefined);
    expect(d.cells[0]!.expr).toEqual({ op: 'Vec2.new', args: { x: { ref: 'w' } } });
    d = ops.setCellExpr(d, 'a', ['args', 'x'], undefined);
    expect(d.cells[0]!.expr).toEqual({ op: 'Vec2.new' });
    const list = def({ cells: [{ name: 'p', expr: { op: 'Polygon2.new', args: { vertices: [vec(0, 0)] } } }] });
    expect(ops.setCellExpr(list, 'p', ['args', 'vertices', 1], vec(1, 0)).cells[0]!.expr).toEqual({
      op: 'Polygon2.new',
      args: { vertices: [vec(0, 0), vec(1, 0)] },
    });
  });
});

describe('store', () => {
  const fresh = () => createPlaygroundStore({ definition: base, options: {}, presets: {}, auto: true });

  test('commits are undone and redone; an unchanged commit is not a step', () => {
    const store = fresh();
    const next = ops.rename(base, 'a', 'start');
    store.getState().commit(next);
    store.getState().commit(next);
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().definition).toEqual(base);
    store.getState().redo();
    expect(store.getState().definition).toEqual(next);
  });

  test('quick edits of the same thing are one undo step', () => {
    const store = fresh();
    for (const w of [3, 4, 5]) store.getState().commit(ops.setInput(base, 'w', { value: w }), { coalesce: 'w' });
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().definition.inputs[0]!.value).toBe(2);
  });

  test('presets follow the definition while automatic, and the hash is kept current', () => {
    const store = fresh();
    expect(store.getState().active.Coordinate).toBe('0..10@1');
    store.getState().commit(ops.setInput(base, 'w', { value: -2.5 }));
    expect(store.getState().active.Coordinate).toBe('±10@0.01');
    expect(store.getState().encoding.hash).toMatch(/^4\//);
    store.getState().update({ auto: false, presets: { Coordinate: '±1@0.001' } });
    expect(store.getState().encoding.error).toBeDefined();
  });
});
