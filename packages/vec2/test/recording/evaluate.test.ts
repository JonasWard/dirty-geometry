import { describe, expect, test } from 'bun:test';
import type { Definition } from '../../src/recording/definition';
import { evaluate } from '../../src/recording/evaluate';

const def = (partial: Partial<Definition>): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs: [],
  functions: [],
  cells: [],
  ...partial,
});
const toJson = (value: unknown) => (value as { toJson(): unknown }).toJson();

describe('evaluate', () => {
  const definition = def({
    inputs: [{ name: 'r', type: 'Length', value: 2 }],
    functions: [
      {
        name: 'at',
        params: [
          { name: 'x', type: 'Coordinate' },
          { name: 'y', type: 'Coordinate' },
        ],
        body: { op: 'Vec2.new', args: { x: { ref: 'x' }, y: { math: '*', args: [{ ref: 'y' }, 2] } } },
      },
    ],
    cells: [
      { name: 'p', expr: { call: 'at', args: { x: 1, y: { ref: 'r' } } } },
      {
        name: 'q',
        expr: { op: 'Vec2.add', self: { ref: 'p' }, args: { other: { value: { type: 'Vec2', x: 1, y: 1 } } } },
      },
      { name: 'x', expr: { op: 'Vec2.x', self: { ref: 'q' } }, output: true },
      {
        name: 'circle',
        expr: { op: 'Circle2.new', args: { center: { ref: 'q' }, radius: { ref: 'r' } } },
        output: true,
      },
    ],
  });

  test('cells run in order, with functions, arithmetic, stored values and field reads', () => {
    const { cells, outputs } = evaluate(definition);
    expect(toJson((cells.get('q') as { value: unknown }).value)).toEqual({ type: 'Vec2', x: 2, y: 5 });
    expect(outputs.x).toBe(2);
    expect(Object.keys(outputs)).toEqual(['x', 'circle']);
  });

  test('inputs can be overridden', () => {
    expect(evaluate(definition, { inputs: { r: 1 } }).outputs.x).toBe(2);
    expect(toJson(evaluate(definition, { inputs: { r: 1 } }).outputs.circle)).toMatchObject({ radius: 1 });
  });

  test('a failing cell keeps its error; cells using it fail too, others still run', () => {
    const broken = def({
      cells: [
        { name: 'a', expr: { op: 'Vec2.nope' } },
        { name: 'b', expr: { op: 'Vec2.add', self: { ref: 'a' }, args: { other: { ref: 'a' } } } },
        { name: 'c', expr: { op: 'Vec2.new', args: { x: 1, y: 2 } }, output: true },
      ],
    });
    const { cells, outputs } = evaluate(broken);
    expect(cells.get('a')).toEqual({ error: 'Vec2.nope is not a vec2 operation' });
    expect(cells.get('b')).toEqual({ error: 'depends on a, which failed' });
    expect(Object.keys(outputs)).toEqual(['c']);
  });

  test('an unchanged cell is reused from the previous run', () => {
    const first = evaluate(definition);
    const second = evaluate(definition, { previous: first });
    expect((second.cells.get('circle') as { value: unknown }).value).toBe(
      (first.cells.get('circle') as { value: unknown }).value,
    );
    const changed = evaluate(definition, { previous: first, inputs: { r: 3 } });
    expect((changed.cells.get('circle') as { value: unknown }).value).not.toBe(
      (first.cells.get('circle') as { value: unknown }).value,
    );
  });

  test('list items and object fields of results', () => {
    const { outputs } = evaluate(
      def({
        cells: [
          {
            name: 'square',
            expr: {
              op: 'Polygon2.new',
              args: {
                vertices: [
                  { op: 'Vec2.new', args: { x: 0, y: 0 } },
                  { op: 'Vec2.new', args: { x: 1, y: 0 } },
                  { op: 'Vec2.new', args: { x: 1, y: 1 } },
                ],
              },
            },
          },
          {
            name: 'first',
            expr: { of: { op: 'Polygon2.segments', self: { ref: 'square' } }, index: 0 },
            output: true,
          },
          {
            name: 'polygons',
            expr: { of: { op: 'Boolean2.union', args: { polygons: [{ ref: 'square' }] } }, field: 'polygons' },
            output: true,
          },
        ],
      }),
    );
    expect(toJson(outputs.first)).toMatchObject({ type: 'Line2' });
    expect(outputs.polygons).toHaveLength(1);
  });
});
