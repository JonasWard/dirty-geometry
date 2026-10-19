import { describe, expect, test } from 'bun:test';
import type { Definition, Expr } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { defaultRegistry } from '@dirty-geometry/vec2/io/default-registry';
import { operationById } from '@dirty-geometry/vec2/schema/schema';
import { checkDefinition, typer, widen } from '@dirty-geometry/vec2/schema/typing';
import { DEFAULT_VALUES } from '../src/playground/defaults';
import * as ops from '../src/playground/model/ops';
import { DEFAULT_FAVOURITES } from '../src/playground/operations';
import { STARTERS } from '../src/playground/starters';
import { createPlaygroundStore, favourites } from '../src/playground/store';

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
    {
      name: 'b',
      expr: { op: 'Vec2.add', self: { ref: 'a' }, args: { other: { ref: 'a' } } },
      type: 'Vec2',
      output: true,
    },
  ],
});
const typeOf = (d: Definition) => (e: Expr) =>
  widen(typer([], 'cell', '').typeOf(e, { refs: checkDefinition(d).refs, fns: checkDefinition(d).fns }));
const outputs = (d: Definition) =>
  JSON.parse(JSON.stringify(evaluate(d).outputs, (_, v) => (v?.toJson ? v.toJson() : v)));

describe('playground data', () => {
  test('every default favourite exists', () => {
    expect(DEFAULT_FAVOURITES.filter((id) => !operationById.has(id))).toEqual([]);
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

  test('chaining calls a method on a value, its arguments defaulted', () => {
    const scope = ops.scopeOf(base, 'b');
    expect(ops.methodsOf('Vec2').some((op) => op.id === 'Vec2.scale')).toBe(true);
    expect(ops.methodsOf('number')).toEqual([]);
    expect(ops.chain(vec(1, 2), 'Vec2.scale', scope)).toEqual({
      op: 'Vec2.scale',
      self: vec(1, 2),
      args: { factor: 1 },
    });
    expect(ops.chain({ ref: 'a' }, 'Vec2.x', scope)).toEqual({ op: 'Vec2.x', self: { ref: 'a' } });
    expect(() => ops.chain(vec(1, 2), 'Vec2.center', scope)).toThrow(/not a method/);
  });

  test('fields and items can be read off object, tuple and list values', () => {
    expect(ops.partsOf('Boolean2Result')).toEqual([{ field: 'polygons' }, { field: 'triMesh' }]);
    expect(ops.partsOf({ tuple: ['Vec2', 'Vec2'] })).toEqual([{ index: 0 }, { index: 1 }]);
    expect(ops.partsOf(['Polygon2'])).toEqual([{ index: 0 }]);
    expect(ops.partsOf('Vec2')).toEqual([]);
    expect(ops.partsOf('number')).toEqual([]);
  });

  test('a field or item is kept on a new value that has it, else dropped', () => {
    const plate = STARTERS.find((s) => s.id === 'plate')!.build();
    const t = typeOf(plate);
    const subtract = plate.cells.find((c) => c.name === 'subtract')!.expr;
    const polygons = { of: { ref: 'subtract' }, field: 'polygons' };
    expect(ops.replaceOf(polygons, subtract, t)).toEqual({ of: subtract, field: 'polygons' });
    expect(ops.replaceOf(polygons, { ref: 'outline' }, t)).toEqual({ ref: 'outline' });
    expect(ops.replaceOf({ of: { ref: 'plate' }, index: 3 }, polygons, t)).toEqual({ of: polygons, index: 3 });
    expect(ops.replaceOf(polygons, { ref: 'nothing' }, t)).toEqual({ of: { ref: 'nothing' }, field: 'polygons' });
  });

  test('removing a method call, field or item leaves the value it was read from', () => {
    expect(ops.unchain({ op: 'Polygon2.area', self: { ref: 'outline' } })).toEqual({ ref: 'outline' });
    expect(ops.unchain({ of: { ref: 'subtract' }, field: 'polygons' })).toEqual({ ref: 'subtract' });
    expect(ops.unchain(vec(1, 2))).toBeUndefined();
    expect(ops.unchain(3)).toBeUndefined();
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
      args: { center: { ref: 'a' }, radius: 1 },
    });
  });

  test('functions: calls, params and removal', () => {
    let d = ops.addFunction(base);
    expect(d.functions).toEqual([{ name: 'f', params: [{ name: 'x', type: 'Coordinate' }], body: { ref: 'x' } }]);
    d = ops.setFunctionBody(d, 'f', [], vec({ ref: 'x' }, { ref: 'x' }));
    d = ops.setCellExpr(d, 'a', [], ops.callFunction(undefined, d.functions[0]!, ops.scopeOf(d, 'a'), typeOf(d)));
    expect(d.cells[0]!.expr).toEqual({ call: 'f', args: { x: 1 } });
    expect(checkDefinition(d).issues).toEqual([]);
    d = ops.addParam(d, 'f', 'Length');
    expect(d.cells[0]!.expr).toEqual({ call: 'f', args: { x: 1, x2: 1 } });
    const withFn = d;
    d = ops.removeParam(d, 'f', 'x2');
    expect(d.functions[0]!.params.map((p) => p.name)).toEqual(['x']);
    const inlined = ops.removeFunction(withFn, 'f');
    expect(inlined.functions).toEqual([]);
    expect(inlined.cells[0]!.expr).toEqual(vec(1, 1));
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

describe('choices', () => {
  test('an output can declare its own type or any wider one', () => {
    const polygon = ops.outputTypes('Polygon2');
    expect(polygon[0]).toBe('Polygon2');
    expect(polygon).toContain('Geometry2');
    expect(polygon).not.toContain('Vec2');
    expect(ops.outputTypes({ or: ['TriMesh2', 'null'] })[0]).toBe('TriMesh2');
    expect(ops.outputTypes('number')).toEqual(expect.arrayContaining(['number', 'Coordinate', 'Length']));
  });

  test('favourites start as the defaults and toggle', () => {
    expect(favourites.getState().ids).toContain('Vec2.new');
    favourites.getState().toggle('Vec2.new');
    expect(favourites.getState().ids).not.toContain('Vec2.new');
    favourites.getState().toggle('Vec2.new');
    expect(favourites.getState().ids).toContain('Vec2.new');
  });
});
