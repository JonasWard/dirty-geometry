/**
 * Runs a version 4 definition: every cell in order, each on real vec2 values. A failing cell keeps its error and
 * the cells after it still run (those that use it fail with "depends on …"), so the playground can show what works.
 */
import { operationById, isRest } from '../../schema/schema';
import { defaultRegistry } from '../io/default-registry';
import type { Definition, Expr, Fn } from './definition';
import { DefinitionError } from './definition';
import { classTable, helperTable, mapValues } from './runtime';

export type CellResult = { value: unknown } | { error: string };
export type Evaluation = {
  inputs: Map<string, unknown>;
  cells: Map<string, CellResult>;
  /** The output cells' values (failed outputs are left out). */
  outputs: Record<string, unknown>;
  /** Per cell: what it was computed from, so an unchanged cell can be reused by the next run. */
  memo: Map<string, { key: string; depNames: string[]; deps: unknown[]; result: CellResult }>;
};
/** `inputs`: values by name instead of the definition's; `previous`: an earlier run whose unchanged cells are reused. */
export type EvaluateOptions = { inputs?: Readonly<Record<string, unknown>>; previous?: Evaluation };

class Failed extends Error {}
const fail = (message: string): never => {
  throw new DefinitionError(message);
};

/** A literal or stored value (an input's value, a list item). */
export const readLiteral = (expr: Expr): unknown =>
  expr !== null && typeof expr === 'object' && !Array.isArray(expr)
    ? 'value' in expr
      ? defaultRegistry.decode(expr.value)
      : 'number' in expr
        ? Number(expr.number)
        : fail('An input holds a literal value')
    : expr;

/** Calls operation `id` on real values: `args` by parameter name, a rest parameter's items in a list. */
export function runOperation(id: string, self: unknown, args: Record<string, unknown>): unknown {
  const op = operationById.get(id) ?? fail(`${id} is not a vec2 operation`);
  const positional: unknown[] = [];
  for (const [name, slot] of op.params) {
    if (isRest(slot)) positional.push(...((args[name] as unknown[] | undefined) ?? []));
    else positional.push(args[name]);
  }
  while (positional.length && positional.at(-1) === undefined) positional.pop();
  if (op.owner === 'helpers') return helperTable[op.member]!(...positional);
  if (op.member === 'new') return new classTable[op.owner](...positional);
  const target = op.static ? classTable[op.owner] : self;
  if (Object(target) !== target || !(op.member in (target as object))) fail(`${id} does not apply to this value`);
  const member = (target as Record<string, unknown>)[op.member];
  return typeof member === 'function' ? member.apply(target, positional) : member;
}

const MATH = {
  '+': (a: number, b: number) => a + b,
  '-': (a: number, b: number) => a - b,
  '*': (a: number, b: number) => a * b,
  '/': (a: number, b: number) => a / b,
};

export function evaluate(definition: Definition, options: EvaluateOptions = {}): Evaluation {
  if (definition.version !== 4) fail(`Unsupported definition version ${definition.version}`);
  const fns = new Map(definition.functions.map((fn) => [fn.name, fn]));
  const inputs = new Map(
    definition.inputs.map((input) => [
      input.name,
      options.inputs && input.name in options.inputs ? options.inputs[input.name] : readLiteral(input.value),
    ]),
  );
  const cells = new Map<string, CellResult>();
  const memo: Evaluation['memo'] = new Map();
  const env = new Map<string, unknown>(inputs);

  function run(expr: Expr, scope: ReadonlyMap<string, unknown>, used: Set<string>): unknown {
    if (expr === null || typeof expr !== 'object') return expr;
    if (Array.isArray(expr)) return expr.map((item) => run(item, scope, used));
    if ('number' in expr || 'value' in expr) return readLiteral(expr);
    if ('object' in expr) return mapValues(expr.object, (item) => run(item, scope, used));
    if ('ref' in expr) {
      used.add(expr.ref);
      const failed = scope === env ? cells.get(expr.ref) : undefined;
      if (failed && 'error' in failed) throw new Failed(`depends on ${expr.ref}, which failed`);
      return scope.has(expr.ref) ? scope.get(expr.ref) : fail(`${expr.ref} is not defined here`);
    }
    if ('op' in expr) {
      const self = expr.self === undefined ? undefined : run(expr.self, scope, used);
      return runOperation(
        expr.op,
        self,
        mapValues(expr.args ?? {}, (arg) => run(arg, scope, used)),
      );
    }
    if ('call' in expr) return call(fns.get(expr.call) ?? fail(`${expr.call} is not a function`), expr.args ?? {});
    if ('math' in expr) {
      const [a, b] = expr.args.map((arg) => run(arg, scope, used) as number);
      if (expr.math === 'neg') return -a!;
      return MATH[expr.math](a!, b!);
    }
    const of = run(expr.of, scope, used) as Record<string | number, unknown> | null;
    const key = 'index' in expr ? expr.index : expr.field;
    if (Object(of) !== of || !(key in of!)) fail(`the value has no ${'index' in expr ? 'item' : 'field'} ${key}`);
    return of![key];

    function call(fn: Fn, args: Record<string, Expr>): unknown {
      const params = new Map(fn.params.map((p) => [p.name, run(args[p.name] ?? null, scope, used)]));
      return run(fn.body, params, new Set());
    }
  }

  const fnKey = JSON.stringify(definition.functions);
  for (const cell of definition.cells) {
    const key = `${JSON.stringify(cell.expr)}|${/"call"/.test(JSON.stringify(cell.expr)) ? fnKey : ''}`;
    const before = options.previous?.memo.get(cell.name);
    const reusable = before?.key === key && before.deps.every((dep, i) => dep === depValue(before.depNames[i]!));
    let result: CellResult;
    let used = new Set<string>();
    if (reusable) {
      result = before.result;
      used = new Set(before.depNames);
    } else {
      try {
        result = { value: run(cell.expr, env, used) };
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    cells.set(cell.name, result);
    if ('value' in result) env.set(cell.name, result.value);
    const depNames = [...used];
    memo.set(cell.name, { key, depNames, deps: depNames.map(depValue), result });
  }
  const outputs: Record<string, unknown> = {};
  for (const cell of definition.cells) {
    const result = cells.get(cell.name)!;
    if (cell.output && 'value' in result) outputs[cell.name] = result.value;
  }
  return { inputs, cells, outputs, memo };

  function depValue(name: string): unknown {
    const result = cells.get(name);
    return result ? ('value' in result ? result.value : result) : inputs.get(name);
  }
}
