import { describe, expect, test } from 'bun:test';
import { CALLS, fromCall, toCall, type CallName } from '../src/calls';
import { runForm, type SharedForm } from '../src/forms';
import * as lib from '../src/lib';

type E = number | { ref: string };
const forms: SharedForm<E>[] = [
  { math: 'pow', args: [2, 3] },
  { math: 'abs', args: [-1] },
  { math: 'sin', args: [1] },
  { math: 'acot', args: [1] },
  { math: 'log10', args: [100] },
  { math: 'atan2', args: [1, 2] },
  { compare: '<', args: [1, 2] },
  { compare: '==', args: [1, 2], slack: 3 },
  { logic: 'and', args: [1, 0] },
  { logic: 'not', args: [1] },
  { if: 1, then: 2, else: 3 },
  { list: 'generate', fn: 'f', count: 3 },
  { list: 'generate', fn: 'f', count: 3, data: 4 },
  { list: 'map', fn: 'f', items: { ref: 'xs' }, data: 1 },
  { list: 'sort', fn: 'f', items: { ref: 'xs' } },
  { list: 'slice', items: { ref: 'xs' }, start: 1 },
  { list: 'at', items: { ref: 'xs' }, index: -1 },
  { list: 'length', items: { ref: 'xs' } },
  { random: 'smooth', seed: 1, t: 2 },
  { random: 'jittered', seed: 1, index: 2, count: 3 },
];

describe('calls', () => {
  test('every form reads back from its call', () => {
    for (const form of forms) {
      const call = toCall(form)!;
      expect(fromCall(call.name, call.args)).toEqual(form);
    }
  });
  test('generate leaves out initial but keeps data', () => {
    expect(toCall<E>({ list: 'generate', fn: 'f', count: 3, data: 4 })!.args).toEqual([
      { expr: 3 },
      { fn: 'f' },
      undefined,
      { expr: 4 },
    ]);
  });
  test('operators are left to the host', () => {
    expect(toCall<E>({ math: '+', args: [1, 2] })).toBeUndefined();
    expect(toCall<E>({ math: 'neg', args: [1] })).toBeUndefined();
  });
  test('wrong arguments are refused', () => {
    expect(() => fromCall<E>('map', [{ expr: 1 }, { expr: 2 }])).toThrow('is a function');
    expect(() => fromCall<E>('pow', [{ expr: 1 }])).toThrow('missing');
    expect(() => fromCall<E>('abs', [{ expr: 1 }, { expr: 2 }])).toThrow('at most');
  });
  test('lib runs like the forms', () => {
    const fns: Record<string, (...args: any[]) => unknown> = { inc: (x: number, _i: number, by = 1) => x + by };
    const xs = [3, 1, 2];
    const run = (e: unknown): unknown => (Array.isArray(e) ? e : typeof e === 'object' && e && 'ref' in e ? xs : e);
    const viaForm = (form: SharedForm<unknown>) => runForm(form, run, (fn, args) => fns[fn]!(...args));
    expect(lib.map(xs, fns.inc as never, 10)).toEqual(
      viaForm({ list: 'map', fn: 'inc', items: { ref: 'xs' }, data: 10 }) as number[],
    );
    expect(lib.sort(xs, (x: number) => x)).toEqual([1, 2, 3]);
    expect(lib.generate(3, (i: number, p: number | null) => (p ?? 0) + i)).toEqual([0, 1, 3]);
    expect(lib.equal(1, 1.0000001)).toBe(true);
    expect(lib.mod(-1, 3)).toBe(2);
    expect(lib.white(1, 0)).toBe(viaForm({ random: 'white', seed: 1, index: 0 }) as number);
  });
  test('every call has a lib function', () => {
    for (const name of Object.keys(CALLS) as CallName[])
      expect(typeof (lib as Record<string, unknown>)[name]).toBe('function');
  });
});
