import { describe, expect, test } from 'bun:test';
import { white } from '@dirty-geometry/fn/random';
import { Vec2 } from '../../src/core/vec2';
import type { Cell, Definition, Expr, Fn } from '../../src/recording/definition';
import { evaluate } from '../../src/recording/evaluate';
import { decodeDefinition, encodeDefinition } from '../../schema/dense/definition';
import { checkDefinition } from '../../schema/typing';

const ref = (name: string) => ({ ref: name });
const def = (cells: Cell[], functions: Fn[] = [], inputs: Definition['inputs'] = []): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs,
  functions,
  cells,
});
const valueOf = (definition: Definition, cell: string) => {
  const result = evaluate(definition).cells.get(cell)!;
  if ('error' in result) throw new Error(result.error);
  return result.value;
};
const errorOf = (definition: Definition, cell: string) => {
  const result = evaluate(definition).cells.get(cell)!;
  return 'error' in result ? result.error : undefined;
};
const issues = (definition: Definition) => checkDefinition(definition).issues.map((i) => i.message);
const roundTrip = (definition: Definition) => decodeDefinition(encodeDefinition(definition)).definition;

/** 12 points on a circle (generate), the ones left of `limit` (filter with data), sorted by y (sort). 6.283 is
 * exact in its Radians slot (0.001 precision), so the example round-trips unchanged. */
const ring: Definition = def(
  [
    { name: 'ring', expr: { list: 'generate', fn: 'onCircle', count: { ref: 'n' } }, type: 'Vec2[]' },
    {
      name: 'kept',
      expr: { list: 'filter', fn: 'leftOf', items: ref('ring'), data: ref('limit') },
      type: 'Vec2[]',
    },
    { name: 'sorted', expr: { list: 'sort', fn: 'byY', items: ref('kept') }, type: 'Vec2[]', output: true },
    { name: 'count', expr: { list: 'length', items: ref('sorted') }, type: 'Index', output: true },
  ],
  [
    {
      name: 'onCircle',
      params: [
        { name: 'i', type: 'Index' },
        { name: 'prev', type: 'Vec2' },
        { name: 'n', type: 'Index' },
      ],
      body: {
        op: 'Circle2.evaluate',
        self: { op: 'Circle2.new', args: { center: { op: 'Vec2.new', args: { x: 0, y: 0 } }, radius: 1 } },
        args: { theta: { math: '*', args: [ref('i'), { math: '/', args: [6.283, ref('n')] }] } },
      },
    },
    {
      name: 'leftOf',
      params: [
        { name: 'p', type: 'Vec2' },
        { name: 'i', type: 'Index' },
        { name: 'limit', type: 'Coordinate' },
      ],
      body: { compare: '<', args: [{ op: 'Vec2.x', self: ref('p') }, ref('limit')] },
    },
    { name: 'byY', params: [{ name: 'p', type: 'Vec2' }], body: { op: 'Vec2.y', self: ref('p') } },
  ],
  [
    { name: 'n', type: 'Index', value: 12 },
    { name: 'limit', type: 'Coordinate', value: 0.1 },
  ],
);

describe('shared forms in definitions', () => {
  test('the ring example evaluates', () => {
    expect(issues(ring)).toEqual([]);
    const { outputs } = evaluate(ring);
    const sorted = outputs.sorted as Vec2[];
    // cos(i·30°) < 0.1 for i = 3 … 9: 7 points.
    expect(outputs.count).toBe(7);
    expect(sorted.every((p) => p instanceof Vec2 && p.x < 0.1)).toBe(true);
    expect(sorted.map((p) => p.y)).toEqual([...sorted.map((p) => p.y)].sort((a, b) => a - b));
  });

  test('a new input re-runs the list forms', () => {
    const { outputs } = evaluate(ring, { inputs: { limit: 2 } });
    expect(outputs.count).toBe(12);
  });

  test('math, compare, logic, if', () => {
    const d = def([
      { name: 'a', expr: { math: 'mod', args: [-1, 3] } },
      { name: 'b', expr: { math: 'round', args: [{ math: 'pow', args: [2, 0.5] }] } },
      { name: 'c', expr: { logic: 'and', args: [{ compare: '==', args: [1, 1.05], slack: 0.1 }, true] } },
      { name: 'd', expr: { if: ref('c'), then: { op: 'Vec2.new', args: { x: 1, y: 2 } }, else: null } },
    ]);
    expect(issues(d)).toEqual([]);
    expect([valueOf(d, 'a'), valueOf(d, 'b'), valueOf(d, 'c')]).toEqual([2, 1, true]);
    expect((valueOf(d, 'd') as Vec2).y).toBe(2);
  });

  test('generate passes previous, from initial', () => {
    const d = def(
      [{ name: 'xs', expr: { list: 'generate', fn: 'double', count: 4, initial: 1 }, type: 'Coordinate[]' }],
      [
        {
          name: 'double',
          params: [
            { name: 'i', type: 'Index' },
            { name: 'prev', type: 'Coordinate' },
          ],
          body: { math: '*', args: [ref('prev'), 2] },
        },
      ],
    );
    expect(issues(d)).toEqual([]);
    expect(valueOf(d, 'xs')).toEqual([2, 4, 8, 16]);
  });

  test('slice, at, random', () => {
    const d = def([
      { name: 'xs', expr: [1, 2, 3, 4, 5], type: 'Coordinate[]' },
      { name: 'mid', expr: { list: 'slice', items: ref('xs'), start: 1, end: -1 } },
      { name: 'last', expr: { list: 'at', items: ref('xs'), index: -1 } },
      { name: 'r', expr: { random: 'white', seed: 1, index: 0 } },
    ]);
    expect(issues(d)).toEqual([]);
    expect([valueOf(d, 'mid'), valueOf(d, 'last'), valueOf(d, 'r')]).toEqual([[2, 3, 4], 5, white(1, 0)]);
  });

  test('runtime errors stay in their cell', () => {
    const d = def([
      { name: 'xs', expr: [1, 2], type: 'Coordinate[]' },
      { name: 'bad', expr: { list: 'at', items: ref('xs'), index: 5 } },
      { name: 'ok', expr: 1 },
    ]);
    expect(errorOf(d, 'bad')).toContain('outside');
    expect(valueOf(d, 'ok')).toBe(1);
  });

  test('the typing reports callback problems', () => {
    const fn = (name: string, params: Fn['params'], body: Expr): Fn => ({ name, params, body });
    const xs: Cell = { name: 'xs', expr: [1, 2], type: 'Coordinate[]' };
    expect(issues(def([xs, { name: 'y', expr: { list: 'map', fn: 'missing', items: ref('xs') } }]))).toEqual([
      'missing is not a function defined before here',
    ]);
    const half = fn('half', [{ name: 'x', type: 'Coordinate' }], { math: '/', args: [ref('x'), 2] });
    expect(issues(def([xs, { name: 'y', expr: { list: 'filter', fn: 'half', items: ref('xs') } }], [half]))).toEqual([
      'a filter returns true or false; half returns number',
    ]);
    const onVec = fn('onVec', [{ name: 'v', type: 'Vec2' }], { op: 'Vec2.x', self: ref('v') });
    expect(
      issues(def([xs, { name: 'y', expr: { list: 'map', fn: 'onVec', items: ref('xs') } }], [onVec]))[0],
    ).toContain('its item is');
    const needsData = fn(
      'scaled',
      [
        { name: 'x', type: 'Coordinate' },
        { name: 'i', type: 'Index' },
        { name: 'k', type: 'Coordinate' },
      ],
      { math: '*', args: [ref('x'), ref('k')] },
    );
    expect(
      issues(def([xs, { name: 'y', expr: { list: 'map', fn: 'scaled', items: ref('xs') } }], [needsData]))[0],
    ).toContain('takes 3 params');
    expect(issues(def([{ name: 'y', expr: { logic: 'not', args: [1] } }]))[0]).toContain('boolean expected');
  });

  test('map types its result from the callback', () => {
    const d = def(
      [
        { name: 'xs', expr: [1, 2], type: 'Coordinate[]' },
        { name: 'ps', expr: { list: 'map', fn: 'atX', items: ref('xs') } },
      ],
      [
        {
          name: 'atX',
          params: [{ name: 'x', type: 'Coordinate' }],
          body: { op: 'Vec2.new', args: { x: ref('x'), y: 0 } },
        },
      ],
    );
    expect(checkDefinition(d).refs.get('ps')).toEqual(['Vec2']);
  });
});

describe('trigonometry', () => {
  test('evaluates, and asin out of range fails the cell that uses it', () => {
    const d = def([
      { name: 'angle', expr: { math: 'atan2', args: [1, -1] } },
      { name: 'unit', expr: { math: 'cos', args: [{ math: 'acot', args: [0] }] } },
      { name: 'big', expr: 2 },
      { name: 'bad', expr: { math: 'asin', args: [ref('big')] } },
      { name: 'uses', expr: { math: '+', args: [ref('bad'), 1] } },
      { name: 'noLog', expr: { math: 'ln', args: [0] } },
      { name: 'usesLog', expr: { math: '*', args: [ref('noLog'), 2] } },
      { name: 'bits', expr: { math: 'log2', args: [1024] } },
    ]);
    expect(valueOf(d, 'angle')).toBeCloseTo((3 * Math.PI) / 4, 12);
    expect(valueOf(d, 'unit')).toBeCloseTo(0, 12);
    expect(valueOf(d, 'bad')).toBeNull();
    expect(errorOf(d, 'uses')).toContain('not null');
    expect(errorOf(d, 'usesLog')).toContain('not null');
    expect(valueOf(d, 'bits')).toBe(10);
  });

  test('asin, acos and the logarithms may be null; the rest are numbers', () => {
    const d = def([
      { name: 'a', expr: { math: 'asin', args: [0.5] } },
      { name: 's', expr: { math: 'sin', args: [0.5] } },
    ]);
    const { refs } = checkDefinition(d);
    expect(refs.get('a')).toEqual({ or: ['number', 'null'] });
    expect(refs.get('s')).toBe('number');
    expect(checkDefinition(def([{ name: 'l', expr: { math: 'ln', args: [2] } }])).refs.get('l')).toEqual({
      or: ['number', 'null'],
    });
  });

  test('operands pack as an angle (sin) or a number (asin, atan2), whatever the slot', () => {
    // 0.785 is on the Radians grid (0.001); in a Coordinate slot (0.01) it would snap to 0.79.
    const d = def([
      { name: 's', expr: { math: 'sin', args: [0.785] }, type: 'Coordinate' },
      { name: 'r', expr: { math: 'acot', args: [{ math: 'tan', args: [1.571] }] }, type: 'Radians' },
      { name: 'p', expr: { math: 'atan2', args: [-1.5, 2.25] }, type: 'Radians' },
      { name: 'c', expr: { math: 'asin', args: [0.5] }, type: 'Radians', output: true },
      // A logarithm's operand packs as a number too: 12.5 would not fit a Parameter slot's range (0..1).
      { name: 'l', expr: { math: 'log10', args: [12.5] }, type: 'Parameter' },
    ]);
    expect(issues(d)).toEqual([]);
    expect(roundTrip(d)).toEqual(d);
  });
});

describe('packing shared forms', () => {
  test('the ring example round-trips', () => {
    expect(roundTrip(ring)).toEqual(ring);
  });

  test('every form round-trips', () => {
    const d = def(
      [
        { name: 'xs', expr: { list: 'generate', fn: 'step', count: 3, initial: 0.5, data: 2 }, type: 'Coordinate[]' },
        { name: 'm', expr: { list: 'map', fn: 'times', items: ref('xs'), data: 3 }, type: 'Coordinate[]' },
        { name: 's', expr: { list: 'slice', items: ref('m'), start: 1 }, type: 'Coordinate[]' },
        { name: 'first', expr: { list: 'at', items: ref('s'), index: 0 }, type: 'Coordinate' },
        {
          name: 'math',
          expr: {
            math: 'max',
            args: [
              { math: 'abs', args: [ref('first')] },
              { math: 'neg', args: [1] },
            ],
          },
          type: 'Coordinate',
        },
        {
          name: 'flag',
          expr: {
            logic: 'or',
            args: [
              { compare: '==', args: [ref('math'), 1], slack: 0.01 },
              { logic: 'not', args: [false] },
            ],
          },
          type: 'boolean',
        },
        {
          name: 'pick',
          expr: { if: ref('flag'), then: 1, else: { list: 'length', items: ref('xs') } },
          type: 'Coordinate',
        },
        { name: 'w', expr: { random: 'white', seed: 7, index: 2 }, type: 'Parameter' },
        { name: 'j', expr: { random: 'jittered', seed: 7, index: 2, count: 8 }, type: 'Parameter' },
        { name: 'sm', expr: { random: 'smooth', seed: 7, t: 1.25, scale: 0.5 }, type: 'Parameter' },
        { name: 'sm2', expr: { random: 'smooth', seed: 7, t: 1.25 }, type: 'Parameter', output: true },
      ],
      [
        {
          name: 'step',
          params: [
            { name: 'i', type: 'Index' },
            { name: 'prev', type: 'Coordinate' },
            { name: 'n', type: 'Index' },
            { name: 'by', type: 'Coordinate' },
          ],
          body: { math: '+', args: [ref('prev'), ref('by')] },
        },
        {
          name: 'times',
          params: [
            { name: 'x', type: 'Coordinate' },
            { name: 'i', type: 'Index' },
            { name: 'k', type: 'Coordinate' },
          ],
          body: { math: '*', args: [ref('x'), ref('k')] },
        },
      ],
    );
    expect(issues(d)).toEqual([]);
    expect(roundTrip(d)).toEqual(d);
    expect(valueOf(d, 'xs')).toEqual([2.5, 4.5, 6.5]);
  });

  test('a form that does not fit its slot is refused', () => {
    const d = def([{ name: 'v', expr: { compare: '<', args: [1, 2] }, type: 'Vec2' }]);
    expect(() => encodeDefinition(d)).toThrow('cannot be a comparison');
  });
});
