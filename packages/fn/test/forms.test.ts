import { describe, expect, test } from 'bun:test';
import { formChildren, isSharedForm, runForm } from '../src/forms';
import type * as F from '../src/forms';

/** A tiny host: expressions are literals, `{ ref }` names or shared forms; functions are JS closures. */
type E =
  | number
  | boolean
  | null
  | E[]
  | { ref: string }
  | F.UnaryMath<E>
  | F.BinaryMath<E>
  | F.Compare<E>
  | F.Not<E>
  | F.AndOr<E>
  | F.If<E>
  | F.Generate<E>
  | F.Each<E>
  | F.Slice<E>
  | F.Length<E>
  | F.At<E>
  | F.White<E>
  | F.Jittered<E>
  | F.Smooth<E>;
const fns: Record<string, (...args: any[]) => unknown> = {
  double: (x: number) => x * 2,
  odd: (x: number) => x % 2 === 1,
  negate: (x: number) => -x,
  count: (i: number, previous: number | null, n: number, data?: { step: number }) =>
    (previous ?? 0) + (data?.step ?? 1) + 0 * i * n,
  scaled: (x: number, _i: number, data: { factor: number }) => x * data.factor,
};
const scope: Record<string, unknown> = { xs: [1, 2, 3, 4], cfg: { step: 5 }, k: { factor: 10 } };
const run = (e: E): unknown => {
  if (e === null || typeof e !== 'object') return e;
  if (Array.isArray(e)) return e.map(run);
  if ('ref' in e) return scope[e.ref];
  return runForm(e, run, (fn, args) => fns[fn]!(...args));
};

describe('runForm', () => {
  test('math, compare, logic, if', () => {
    expect(run({ math: '+', args: [1, { math: 'pow', args: [2, 3] }] })).toBe(9);
    expect(run({ math: 'floor', args: [-1.5] })).toBe(-2);
    expect(run({ math: 'atan2', args: [0, -1] })).toBe(Math.PI);
    expect(run({ math: 'asin', args: [2] })).toBeNull();
    expect(() => run({ math: '+', args: [{ math: 'asin', args: [2] }, 1] })).toThrow('not null');
    expect(run({ compare: '==', args: [1, 1.05], slack: 0.1 })).toBe(true);
    expect(run({ logic: 'not', args: [{ compare: '<', args: [1, 2] }] })).toBe(false);
    expect(run({ if: { compare: '>', args: [2, 1] }, then: 1, else: 2 })).toBe(1);
  });
  test('if only runs the branch it picks', () => {
    expect(run({ if: true, then: 1, else: { math: '+', args: [true, 1] } })).toBe(1);
    expect(() => run({ if: 1, then: 1, else: 2 })).toThrow('true or false');
  });
  test('lists', () => {
    expect(run({ list: 'map', fn: 'double', items: { ref: 'xs' } })).toEqual([2, 4, 6, 8]);
    expect(run({ list: 'filter', fn: 'odd', items: { ref: 'xs' } })).toEqual([1, 3]);
    expect(run({ list: 'sort', fn: 'negate', items: { ref: 'xs' } })).toEqual([4, 3, 2, 1]);
    expect(run({ list: 'slice', items: { ref: 'xs' }, start: 1, end: 3 })).toEqual([2, 3]);
    expect(run({ list: 'length', items: { ref: 'xs' } })).toBe(4);
    expect(run({ list: 'at', items: { ref: 'xs' }, index: -1 })).toBe(4);
    expect(() => run({ list: 'length', items: 3 })).toThrow('is a list');
  });
  test('generate with and without initial and data', () => {
    expect(run({ list: 'generate', fn: 'count', count: 3 })).toEqual([1, 2, 3]);
    expect(run({ list: 'generate', fn: 'count', count: 3, initial: 10 })).toEqual([11, 12, 13]);
    expect(run({ list: 'generate', fn: 'count', count: 2, data: { ref: 'cfg' } })).toEqual([5, 10]);
  });
  test('data reaches map callbacks', () => {
    expect(run({ list: 'map', fn: 'scaled', items: { ref: 'xs' }, data: { ref: 'k' } })).toEqual([10, 20, 30, 40]);
  });
  test('random', () => {
    const v = run({ random: 'white', seed: 1, index: 0 });
    expect(v).toBe(0.1368145691230893);
    expect(run({ random: 'jittered', seed: 5, index: 2, count: 10 })).toBe(0.2970984379993752);
    expect(run({ random: 'smooth', seed: 3, t: 2.25, scale: 0.5 })).toBe(0.5114719610428438);
  });
  test('type errors name what was wrong', () => {
    expect(() => run({ math: '+', args: [1, true] })).toThrow('is a number, not boolean');
  });
});

describe('formChildren', () => {
  test('lists operands with their paths', () => {
    expect(formChildren<E>({ compare: '==', args: [1, 2], slack: 3 })).toEqual([
      { path: ['args', 0], expr: 1 },
      { path: ['args', 1], expr: 2 },
      { path: ['slack'], expr: 3 },
    ]);
    expect(formChildren<E>({ list: 'generate', fn: 'f', count: 3, data: 4 })).toEqual([
      { path: ['count'], expr: 3 },
      { path: ['data'], expr: 4 },
    ]);
    expect(formChildren<E>({ if: true, then: 1, else: 2 }).map((c) => c.path)).toEqual([['if'], ['then'], ['else']]);
  });
  test('isSharedForm', () => {
    expect([isSharedForm({ math: '+', args: [1, 2] }), isSharedForm({ ref: 'x' }), isSharedForm([1])]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
