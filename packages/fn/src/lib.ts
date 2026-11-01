/**
 * The shared forms as plain functions, named as `./calls` prints them (`lib.max(a, b)`), so printed definitions run as
 * code. Each one does what the form does when a definition is evaluated.
 */
import * as lists from './lists';
import { BINARY, compare, UNARY } from './math';
import * as random from './random';

export const pow = BINARY.pow;
export const min = BINARY.min;
export const max = BINARY.max;
export const mod = BINARY.mod;
export const { abs, sign, round, floor, ceil } = UNARY;

export const smallerThan = (a: number, b: number) => compare('<', a, b);
export const biggerThan = (a: number, b: number) => compare('>', a, b);
export const equal = (a: number, b: number, slack?: number) => compare('==', a, b, slack);
export const and = (a: boolean, b: boolean) => a && b;
export const or = (a: boolean, b: boolean) => a || b;
export const not = (a: boolean) => !a;
/** Both branches are already computed here; in a definition only the chosen one runs. */
export const ifElse = <T, U>(condition: boolean, then: T, otherwise: U): T | U => (condition ? then : otherwise);

/** `fn(index, previous, count, data)`; `data` is passed only when given, as in a definition. */
export const generate = <T, D>(
  count: number,
  fn: (index: number, previous: T | null, count: number, data?: D) => T,
  initial?: T,
  ...data: [D?]
): T[] =>
  lists.generate<T>(count, (i, previous, n) => fn(i, previous, n, ...data), initial === undefined ? null : initial);
export const map = <T, U, D>(items: readonly T[], fn: (item: T, index: number, data?: D) => U, ...data: [D?]): U[] =>
  lists.map(items, (item, i) => fn(item, i, ...data));
export const filter = <T, D>(items: readonly T[], fn: (item: T, index: number, data?: D) => boolean, ...data: [D?]) =>
  lists.filter(items, (item, i) => fn(item, i, ...data));
export const sort = <T, D>(items: readonly T[], fn: (item: T, index: number, data?: D) => number, ...data: [D?]) =>
  lists.sortBy(items, (item, i) => fn(item, i, ...data));
export const { slice, at } = lists;
export const length = (items: readonly unknown[]) => items.length;

export const { white, jittered, smooth } = random;
