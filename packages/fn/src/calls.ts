/**
 * Each shared form as a function call, `lib.max(a, b)` or `lib.map(points, onCircle, data)`: how code prints a form,
 * and how a parser reads it back. `lib` is `./lib`, so printed code runs. A callback is a function's name.
 *
 * `+ - * /` and `neg` are left to the host: code writes them as operators.
 */
import type { SharedForm } from './forms';

/** A call's argument: an expression, a callback's name, or left out (an optional before a given one). */
export type CallArg<E> = { expr: E } | { fn: string } | undefined;
/** `e`: an expression; `e?`: an optional one; `fn`: a callback. */
type Param = 'e' | 'e?' | 'fn';

export const CALLS = {
  pow: ['e', 'e'],
  min: ['e', 'e'],
  max: ['e', 'e'],
  mod: ['e', 'e'],
  abs: ['e'],
  sign: ['e'],
  round: ['e'],
  floor: ['e'],
  ceil: ['e'],
  smallerThan: ['e', 'e'],
  biggerThan: ['e', 'e'],
  equal: ['e', 'e', 'e?'],
  and: ['e', 'e'],
  or: ['e', 'e'],
  not: ['e'],
  ifElse: ['e', 'e', 'e'],
  generate: ['e', 'fn', 'e?', 'e?'],
  map: ['e', 'fn', 'e?'],
  filter: ['e', 'fn', 'e?'],
  sort: ['e', 'fn', 'e?'],
  slice: ['e', 'e', 'e?'],
  length: ['e'],
  at: ['e', 'e'],
  white: ['e', 'e'],
  jittered: ['e', 'e', 'e'],
  smooth: ['e', 'e', 'e?'],
} as const satisfies Record<string, readonly Param[]>;
export type CallName = keyof typeof CALLS;
export const isCallName = (name: string): name is CallName => Object.hasOwn(CALLS, name);

const COMPARE = { '<': 'smallerThan', '>': 'biggerThan', '==': 'equal' } as const;
const COMPARE_OF = { smallerThan: '<', biggerThan: '>', equal: '==' } as const;

/** Trailing left-out arguments are dropped. */
const trim = <E>(args: CallArg<E>[]) => {
  while (args.length && args.at(-1) === undefined) args.pop();
  return args;
};
const e = <E>(x: E | undefined): CallArg<E> => (x === undefined ? undefined : { expr: x });

/** `form` as a call; `undefined` for the operator forms (`+ - * /`, `neg`). */
export function toCall<E>(form: SharedForm<E>): { name: CallName; args: CallArg<E>[] } | undefined {
  if ('math' in form)
    return ['+', '-', '*', '/', 'neg'].includes(form.math)
      ? undefined
      : { name: form.math as CallName, args: form.args.map((x) => e(x)) };
  if ('compare' in form)
    return { name: COMPARE[form.compare], args: trim([e(form.args[0]), e(form.args[1]), e(form.slack)]) };
  if ('logic' in form) return { name: form.logic, args: form.args.map((x) => e(x)) };
  if ('if' in form) return { name: 'ifElse', args: [e(form.if), e(form.then), e(form.else)] };
  if ('random' in form) {
    if (form.random === 'white') return { name: 'white', args: [e(form.seed), e(form.index)] };
    if (form.random === 'jittered') return { name: 'jittered', args: [e(form.seed), e(form.index), e(form.count)] };
    return { name: 'smooth', args: trim([e(form.seed), e(form.t), e(form.scale)]) };
  }
  switch (form.list) {
    case 'generate':
      return { name: 'generate', args: trim([e(form.count), { fn: form.fn }, e(form.initial), e(form.data)]) };
    case 'map':
    case 'filter':
    case 'sort':
      return { name: form.list, args: trim([e(form.items), { fn: form.fn }, e(form.data)]) };
    case 'slice':
      return { name: 'slice', args: trim([e(form.items), e(form.start), e(form.end)]) };
    case 'length':
      return { name: 'length', args: [e(form.items)] };
    case 'at':
      return { name: 'at', args: [e(form.items), e(form.index)] };
  }
}

export class CallError extends Error {
  override name = 'CallError';
}

/** The form a call stands for. Fails (with a message for the reader) when the arguments do not fit. */
export function fromCall<E>(name: CallName, args: CallArg<E>[]): SharedForm<E> {
  const params: readonly Param[] = CALLS[name];
  if (args.length > params.length) throw new CallError(`lib.${name} takes at most ${params.length} arguments`);
  const values = params.map((param, i) => {
    const arg = args[i];
    if (param === 'fn') {
      if (!arg || !('fn' in arg))
        throw new CallError(`lib.${name}: argument ${i + 1} is a function defined before here`);
      return arg.fn;
    }
    if (arg && 'fn' in arg)
      throw new CallError(`lib.${name}: argument ${i + 1} is a value, not the function ${arg.fn}`);
    if (!arg && param === 'e') throw new CallError(`lib.${name}: argument ${i + 1} is missing`);
    return arg?.expr;
  });
  const [a, b, c, d] = values as [any, any, any, any];
  const opt = <K extends string>(key: K, v: E | undefined) => (v === undefined ? {} : ({ [key]: v } as Record<K, E>));
  switch (name) {
    case 'pow':
    case 'min':
    case 'max':
    case 'mod':
      return { math: name, args: [a, b] };
    case 'abs':
    case 'sign':
    case 'round':
    case 'floor':
    case 'ceil':
      return { math: name, args: [a] };
    case 'smallerThan':
    case 'biggerThan':
    case 'equal':
      return { compare: COMPARE_OF[name], args: [a, b], ...opt('slack', c) };
    case 'and':
    case 'or':
      return { logic: name, args: [a, b] };
    case 'not':
      return { logic: 'not', args: [a] };
    case 'ifElse':
      return { if: a, then: b, else: c };
    case 'generate':
      return { list: 'generate', fn: b, count: a, ...opt('initial', c), ...opt('data', d) };
    case 'map':
    case 'filter':
    case 'sort':
      return { list: name, fn: b, items: a, ...opt('data', c) };
    case 'slice':
      return { list: 'slice', items: a, start: b, ...opt('end', c) };
    case 'length':
      return { list: 'length', items: a };
    case 'at':
      return { list: 'at', items: a, index: b };
    case 'white':
      return { random: 'white', seed: a, index: b };
    case 'jittered':
      return { random: 'jittered', seed: a, index: b, count: c };
    case 'smooth':
      return { random: 'smooth', seed: a, t: b, ...opt('scale', c) };
  }
}
