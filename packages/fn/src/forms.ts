/**
 * Expression forms that any definition language can share: math, comparisons, logic, a choice, lists and seeded
 * random. `E` is the host's own expression type, so these nest inside it and its expressions nest inside these.
 *
 * Callbacks are named functions of the host (`fn: 'onCircle'`), called with positional arguments:
 * - `generate`: `(index, previous, count, data)`
 * - `map` / `filter` / `sort`: `(item, index, data)`
 *
 * `data` is optional; it is how a callback gets values from outside (an input, an earlier cell) while staying pure.
 */
import { at, filter, generate, map, slice, sortBy } from './lists';
import { BINARY, compare, isUnary, logic, UNARY, type BinaryOp, type CompareOp, type UnaryOp } from './math';
import { jittered, smooth, white } from './random';

export type ListOp = 'generate' | 'map' | 'filter' | 'sort' | 'slice' | 'length' | 'at';
export const LIST_OPS: readonly ListOp[] = ['generate', 'map', 'filter', 'sort', 'slice', 'length', 'at'];
/** The list forms that call a function. */
export const CALLBACK_LIST_OPS: readonly ListOp[] = ['generate', 'map', 'filter', 'sort'];

/* Each form is an interface so a host's recursive `Expr` union can list them (`| UnaryMath<Expr> | …`). Interfaces
 * resolve lazily; `| SharedForm<Expr>` itself would be a circular alias, so hosts list the members. */
export interface UnaryMath<E> {
  math: UnaryOp;
  args: [E];
}
export interface BinaryMath<E> {
  math: BinaryOp;
  args: [E, E];
}
export interface Compare<E> {
  compare: CompareOp;
  args: [E, E];
  slack?: E;
}
export interface Not<E> {
  logic: 'not';
  args: [E];
}
export interface AndOr<E> {
  logic: 'and' | 'or';
  args: [E, E];
}
export interface If<E> {
  if: E;
  then: E;
  else: E;
}
export interface Generate<E> {
  list: 'generate';
  fn: string;
  count: E;
  initial?: E;
  data?: E;
}
export interface Each<E> {
  list: 'map' | 'filter' | 'sort';
  fn: string;
  items: E;
  data?: E;
}
export interface Slice<E> {
  list: 'slice';
  items: E;
  start: E;
  end?: E;
}
export interface Length<E> {
  list: 'length';
  items: E;
}
export interface At<E> {
  list: 'at';
  items: E;
  index: E;
}
export interface White<E> {
  random: 'white';
  seed: E;
  index: E;
}
export interface Jittered<E> {
  random: 'jittered';
  seed: E;
  index: E;
  count: E;
}
export interface Smooth<E> {
  random: 'smooth';
  seed: E;
  t: E;
  scale?: E;
}

export type SharedForm<E> =
  | UnaryMath<E>
  | BinaryMath<E>
  | Compare<E>
  | Not<E>
  | AndOr<E>
  | If<E>
  | Generate<E>
  | Each<E>
  | Slice<E>
  | Length<E>
  | At<E>
  | White<E>
  | Jittered<E>
  | Smooth<E>;

/** The key that names each form's kind. */
export const FORM_KEYS = ['math', 'compare', 'logic', 'if', 'list', 'random'] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export const formKey = (e: unknown): FormKey | undefined =>
  e !== null && typeof e === 'object' && !Array.isArray(e) ? FORM_KEYS.find((key) => key in e) : undefined;
export const isSharedForm = <E>(e: unknown): e is SharedForm<E> => formKey(e) !== undefined;

/** A form's operands, by field name, in a fixed order (missing optionals left out). */
const FIELDS: Record<string, readonly string[]> = {
  generate: ['count', 'initial', 'data'],
  map: ['items', 'data'],
  filter: ['items', 'data'],
  sort: ['items', 'data'],
  slice: ['items', 'start', 'end'],
  length: ['items'],
  at: ['items', 'index'],
  white: ['seed', 'index'],
  jittered: ['seed', 'index', 'count'],
  smooth: ['seed', 't', 'scale'],
  if: ['if', 'then', 'else'],
};

/** The operand fields a form can have, in order (`['items', 'data']` for a map). Args-based forms have none. */
export function formFields(form: SharedForm<unknown>): readonly string[] {
  if ('if' in form) return FIELDS.if!;
  if ('list' in form) return FIELDS[form.list]!;
  if ('random' in form) return FIELDS[form.random]!;
  return [];
}

/** Each sub-expression with its path inside the form: `['args', 0]`, `['items']`, `['then']`, … */
export function formChildren<E>(form: SharedForm<E>): { path: (string | number)[]; expr: E }[] {
  if ('args' in form) {
    const children = form.args.map((expr, i) => ({ path: ['args', i] as (string | number)[], expr }));
    if ('compare' in form && form.slack !== undefined) children.push({ path: ['slack'], expr: form.slack });
    return children;
  }
  const record = form as unknown as Record<string, E | undefined>;
  return formFields(form)
    .filter((field) => record[field] !== undefined)
    .map((field) => ({ path: [field], expr: record[field]! }));
}

export class FormError extends Error {
  override name = 'FormError';
}
const fail = (message: string): never => {
  throw new FormError(message);
};
const num = (v: unknown, what: string): number =>
  typeof v === 'number' ? v : fail(`${what} is a number, not ${show(v)}`);
const bool = (v: unknown, what: string): boolean =>
  typeof v === 'boolean' ? v : fail(`${what} is true or false, not ${show(v)}`);
const list = (v: unknown, what: string): unknown[] =>
  Array.isArray(v) ? v : fail(`${what} is a list, not ${show(v)}`);
const show = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v);

/**
 * Evaluates a form. `run` evaluates one of its operands (in the host's current scope); `call` calls the host
 * function `fn` with positional arguments. Only the branch `if` picks is run.
 */
export function runForm<E>(
  form: SharedForm<E>,
  run: (e: E) => unknown,
  call: (fn: string, args: unknown[]) => unknown,
): unknown {
  if ('math' in form) {
    if (isUnary(form.math)) return UNARY[form.math](num(run(form.args[0]), 'An operand'));
    const op = BINARY[form.math as BinaryOp] ?? fail(`${form.math} is not a math operation`);
    return op(num(run(form.args[0]), 'An operand'), num(run(form.args[1]!), 'An operand'));
  }
  if ('compare' in form) {
    const slack = form.slack === undefined ? undefined : num(run(form.slack), 'The slack');
    return compare(form.compare, num(run(form.args[0]), 'An operand'), num(run(form.args[1]), 'An operand'), slack);
  }
  if ('logic' in form) {
    const a = bool(run(form.args[0]), 'An operand');
    if (form.logic === 'not') return logic('not', a);
    return logic(form.logic, a, bool(run(form.args[1]), 'An operand'));
  }
  if ('if' in form) return bool(run(form.if), 'A condition') ? run(form.then) : run(form.else);
  if ('random' in form) {
    const seed = num(run(form.seed), 'The seed');
    if (form.random === 'white') return white(seed, num(run(form.index), 'The index'));
    if (form.random === 'jittered')
      return jittered(seed, num(run(form.index), 'The index'), num(run(form.count), 'The count'));
    return smooth(
      seed,
      num(run(form.t), 't'),
      form.scale === undefined ? undefined : num(run(form.scale), 'The scale'),
    );
  }
  if (form.list === 'generate') {
    const data = form.data === undefined ? [] : [run(form.data)];
    const initial = form.initial === undefined ? null : run(form.initial);
    return generate(
      num(run(form.count), 'The count'),
      (i, previous, n) => call(form.fn, [i, previous, n, ...data]),
      initial,
    );
  }
  const items = list(run(form.items), 'The items');
  switch (form.list) {
    case 'map':
    case 'filter':
    case 'sort': {
      const data = form.data === undefined ? [] : [run(form.data)];
      const fn = (item: unknown, i: number) => call(form.fn, [item, i, ...data]);
      if (form.list === 'map') return map(items, fn);
      if (form.list === 'filter') return filter(items, fn as (item: unknown, i: number) => boolean);
      return sortBy(items, fn as (item: unknown, i: number) => number);
    }
    case 'slice':
      return slice(
        items,
        num(run(form.start), 'The start'),
        form.end === undefined ? undefined : num(run(form.end), 'The end'),
      );
    case 'length':
      return items.length;
    case 'at':
      return at(items, num(run(form.index), 'The index'));
  }
  return fail(`${(form as { list: string }).list} is not a list operation`);
}
