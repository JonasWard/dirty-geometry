/**
 * List operations that take a callback. They never change their input, and the callbacks get everything they use as
 * arguments, so a pure callback gives a pure result.
 */

/** The most items `generate` makes, so a stored definition cannot hang whoever runs it. */
export const GENERATE_LIMIT = 10_000;

export class ListError extends Error {
  override name = 'ListError';
}
const fail = (message: string): never => {
  throw new ListError(message);
};

const count = (n: number, what: string): number =>
  Number.isInteger(n) && n >= 0 ? n : fail(`${what} must be a whole number of at least 0, got ${n}`);

/**
 * `n` items, each made from its index, the item before it, and `n`. The first item gets `initial` as `previous`, or
 * `null` when there is none.
 */
export function generate<T>(
  n: number,
  fn: (index: number, previous: T | null, count: number) => T,
  initial: T | null = null,
): T[] {
  if (count(n, 'The count') > GENERATE_LIMIT) fail(`generate makes at most ${GENERATE_LIMIT} items, not ${n}`);
  const items: T[] = [];
  let previous = initial;
  for (let i = 0; i < n; i++) items.push((previous = fn(i, previous, n)));
  return items;
}

export const map = <T, U>(items: readonly T[], fn: (item: T, index: number) => U): U[] =>
  items.map((item, i) => fn(item, i));

export const filter = <T>(items: readonly T[], fn: (item: T, index: number) => boolean): T[] =>
  items.filter((item, i) => {
    const keep = fn(item, i);
    return typeof keep === 'boolean' ? keep : fail(`A filter returns true or false, not ${String(keep)}`);
  });

/** Ascending by the number `key` gives each item; equal keys keep their order. NaN keys go last. */
export function sortBy<T>(items: readonly T[], key: (item: T, index: number) => number): T[] {
  const keyed = items.map((item, i) => {
    const k = key(item, i);
    return { item, i, k: typeof k === 'number' ? k : fail(`A sort key is a number, not ${String(k)}`) };
  });
  const rank = (k: number) => (Number.isNaN(k) ? Infinity : k);
  keyed.sort((a, b) => rank(a.k) - rank(b.k) || (Number.isNaN(a.k) ? 1 : 0) - (Number.isNaN(b.k) ? 1 : 0) || a.i - b.i);
  return keyed.map(({ item }) => item);
}

/** Items `start` up to (not including) `end`; negative positions count from the end, like `Array.slice`. */
export const slice = <T>(items: readonly T[], start: number, end?: number): T[] => items.slice(start, end);

/** The item at `index`; a negative index counts from the end. Fails out of range. */
export function at<T>(items: readonly T[], index: number): T {
  if (!Number.isInteger(index)) fail(`An index is a whole number, not ${index}`);
  const i = index < 0 ? items.length + index : index;
  return i >= 0 && i < items.length ? items[i]! : fail(`Index ${index} is outside a list of ${items.length}`);
}
