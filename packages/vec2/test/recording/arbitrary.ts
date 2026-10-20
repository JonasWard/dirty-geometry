/**
 * Seeded random version 4 definitions that type-check: for round-trip properties (dense packing, printing and
 * parsing). Literals sit on the default ranges' grids, so packing keeps them exactly.
 */
import type { Definition, Expr, Fn } from '../../src/recording/definition';
import dense from '../../schema/vec2.dense.json';
import { isKind, isOptional, isRest, operations, slotType, type Type } from '../../schema/schema';
import { assignable, isNumeric, members, nonNull, roleOf, typeName, typer, widen } from '../../schema/typing';

export const rng = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
type Rand = () => number;
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

const firstRange = (role: string) => {
  const definition = dense.definitions.find((d) => d.name === role)!;
  return Object.values(definition.presets)[0] as { min: number; max: number };
};
/** A small whole number in the default range of `role`. */
const numberIn = (rand: Rand, role: string) => {
  const { min, max } = firstRange(role);
  const lo = Math.max(min, -3);
  const hi = Math.min(max, 3);
  return Math.round(lo + rand() * (hi - lo)) || 0; // never -0
};
const VALUES: Record<string, unknown> = {
  Vec2: { type: 'Vec2', x: 1, y: 2 },
  Circle2: { type: 'Circle2', center: { type: 'Vec2', x: 0, y: 0 }, radius: 1 },
  Line2: { type: 'Line2', from: { type: 'Vec2', x: 0, y: 0 }, to: { type: 'Vec2', x: 1, y: 1 } },
};

type Scope = { name: string; type: Type }[];

export function arbitraryDefinition(seed: number, size = 4): Definition {
  const rand = rng(seed);
  const fnSigs = new Map<string, { params: { name: string; type: Type }[]; returns: Type }>();
  const typeOf = (e: Expr, scope: Scope) =>
    widen(typer([], 'cell', '').typeOf(e, { refs: new Map(scope.map((b) => [b.name, b.type])), fns: fnSigs }));
  /** A literal list of up to two items of `type`. */
  function items(type: Type, depth: number, scope: Scope, fns: Fn[], fnTypes: Map<string, Type>): Expr[] | undefined {
    const list = [...Array(Math.floor(rand() * 3))].map(() => expr(type, depth, scope, fns, fnTypes));
    return list.every((item) => item !== undefined) ? (list as Expr[]) : undefined;
  }
  /** An expression of `type`, or undefined when none comes to hand within `depth`. */
  function expr(type: Type, depth: number, scope: Scope, fns: Fn[], fnTypes: Map<string, Type>): Expr | undefined {
    const ms = members(type);
    const tries: (() => Expr | undefined)[] = [];
    const refs = scope.filter((b) => assignable(b.type, type));
    if (refs.length) tries.push(() => ({ ref: pick(rand, refs).name }));
    const role = roleOf(type);
    if (role) tries.push(() => numberIn(rand, role));
    const enums = ms.filter((m) => isKind(m, 'enum')).flatMap((m) => (m as { enum: unknown[] }).enum);
    if (enums.length) tries.push(() => pick(rand, enums) as Expr);
    if (ms.includes('boolean')) tries.push(() => rand() < 0.5);
    if (ms.includes('string')) tries.push(() => 'ab');
    const stored = ms.filter((m) => typeof m === 'string' && m in VALUES);
    if (stored.length) tries.push(() => ({ value: VALUES[pick(rand, stored) as string] }));
    const list = ms.find((m) => Array.isArray(m)) as Type[] | undefined;
    if (list) tries.push(() => items(list[0]!, depth - 1, scope, fns, fnTypes));
    if (depth > 0) {
      if (role)
        tries.push(() => {
          const a = expr(role, depth - 1, scope, fns, fnTypes);
          const b = expr(role, depth - 1, scope, fns, fnTypes);
          if (a === undefined || b === undefined) return undefined;
          return rand() < 0.2
            ? { math: 'neg', args: [a] }
            : { math: pick(rand, ['+', '-', '*', '/'] as const), args: [a, b] };
        });
      const lists = operations.filter((o) => Array.isArray(o.returns) && assignable(o.returns[0]!, type));
      if (lists.length)
        tries.push(() => {
          const of = call(pick(rand, lists), depth - 1, scope, fns, fnTypes);
          return of && { of, index: 0 };
        });
      const callable = fns.filter((fn) => assignable(fnTypes.get(fn.name)!, type));
      if (callable.length)
        tries.push(() => {
          const fn = pick(rand, callable);
          const args: Record<string, Expr> = {};
          for (const p of fn.params) {
            const arg = expr(p.type, depth - 1, scope, fns, fnTypes);
            if (arg === undefined) return undefined;
            args[p.name] = arg;
          }
          return { call: fn.name, ...(fn.params.length && { args }) };
        });
      const fitting = operations.filter((op) => assignable(op.returns, type) && op.params.length <= 4);
      for (let i = 0; i < 3 && fitting.length; i++)
        tries.push(() => call(pick(rand, fitting), depth, scope, fns, fnTypes));
    }
    for (const attempt of [...tries].sort(() => rand() - 0.5)) {
      const result = attempt();
      if (result !== undefined) return result;
    }
    return undefined;
  }
  /** A call of `op` with arguments made up within `depth`. */
  function call(
    op: (typeof operations)[number],
    depth: number,
    scope: Scope,
    fns: Fn[],
    fnTypes: Map<string, Type>,
  ): Expr | undefined {
    const self = op.static ? undefined : expr(op.owner, depth - 1, scope, fns, fnTypes);
    if (!op.static && self === undefined) return undefined;
    const args: Record<string, Expr> = {};
    for (const [name, slot] of op.params) {
      const optional = isOptional(slot) || isRest(slot);
      if (optional && rand() < 0.5) continue;
      const value = isRest(slot)
        ? items(slotType(slot), depth - 1, scope, fns, fnTypes)
        : expr(slotType(slot), depth - 1, scope, fns, fnTypes);
      if (value === undefined) {
        if (optional) continue;
        return undefined;
      }
      if (isRest(slot) && (value as Expr[]).length === 0) continue;
      args[name] = value;
    }
    return { op: op.id, ...(self !== undefined && { self }), ...(Object.keys(args).length && { args }) };
  }

  const inputTypes = ['Coordinate', 'Length', 'Radians', 'Vec2', 'boolean'];
  const inputs = [...Array(1 + Math.floor(rand() * 3))].map((_, i) => {
    const type = pick(rand, inputTypes);
    const value: Expr =
      type === 'Vec2' ? { value: VALUES.Vec2 } : type === 'boolean' ? rand() < 0.5 : numberIn(rand, type);
    return { name: `in${i}`, type, value };
  });
  const functions: Fn[] = [];
  const fnTypes = new Map<string, Type>();
  for (let i = 0; i < Math.floor(rand() * 3); i++) {
    const params = [...Array(1 + Math.floor(rand() * 2))].map((_, j) => ({
      name: `p${j}`,
      type: pick(rand, ['Coordinate', 'Vec2', 'Length']),
    }));
    const body = expr(pick(rand, ['Vec2', 'Coordinate', 'Circle2']), 2, params, functions, fnTypes);
    if (body === undefined) continue;
    const fn = { name: `f${functions.length}`, params, body };
    functions.push(fn);
    fnTypes.set(fn.name, typeOf(body, params));
    fnSigs.set(fn.name, { params, returns: fnTypes.get(fn.name)! });
  }
  const scope: Scope = inputs.map((input) => ({ name: input.name, type: input.type }));
  const cells: Definition['cells'] = [];
  const targets: Type[] = ['Vec2', 'Polygon2', 'Circle2', 'Line2', 'Coordinate', 'Aabb2', ['Vec2'], 'boolean'];
  for (let i = 0; cells.length < size && i < size * 4; i++) {
    const type = pick(rand, targets);
    const e = expr(type, 3, scope, functions, fnTypes);
    if (e === undefined) continue;
    const name = `c${cells.length}`;
    // An empty list says nothing about its items: it needs a declared type.
    const declare = (isNumeric(type) && rand() < 0.5) || (Array.isArray(e) && e.length === 0);
    const output = rand() < 0.4;
    // An output states its type: the declared one, else its value's.
    const own = declare ? undefined : output ? typeName(nonNull(typeOf(e, scope))) : undefined;
    cells.push({
      name,
      ...(own && { type: own }),
      expr: e,
      ...(declare && { type: typeName(type) }),
      ...(output && { output: true as const }),
    });
    scope.push({ name, type: declare ? type : typeOf(e, scope) });
  }
  return { format: 'vec2-definition', version: 4, inputs, functions, cells };
}
