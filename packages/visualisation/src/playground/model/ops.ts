/**
 * Edits of a definition, each a pure `Definition → Definition` (or `Expr → Expr`). Names are kept consistent:
 * renaming rewrites every use, removing a cell writes its expression into the cells that used it, removing an input
 * writes its value there, and removing a function writes its body into the calls.
 */
import type { Cell, Definition, Expr, Fn, Input } from '@dirty-geometry/vec2/recording/definition';
import { mapExpr, setAt, type ExprPath } from '@dirty-geometry/vec2/recording/expr';
import {
  isKind,
  isOptional,
  isRest,
  operationById,
  operations,
  slotType,
  type Type,
} from '@dirty-geometry/vec2/schema/schema';
import {
  assignable,
  checkDefinition,
  isClass,
  members,
  nameProblem,
  nonNull,
  parseTypeName,
  roleOf,
  typeName,
} from '@dirty-geometry/vec2/schema/typing';
import { PACKABLE_TYPES } from '@dirty-geometry/vec2/schema/dense/definition';
import { DEFAULT_NUMBER, DEFAULT_VALUES, defaultLiteral } from '../defaults';

export type { ExprPath };
/** What a binding may refer to where an expression stands: names with their types, in definition order. */
export type Scope = { name: string; type: Type }[];

const isObj = (e: Expr): e is Exclude<Expr, null | string | number | boolean | Expr[]> =>
  e !== null && typeof e === 'object' && !Array.isArray(e);
const refTo = (name: string) => (e: Expr) => isObj(e) && 'ref' in e && e.ref === name;

/** A name not yet used, from `base` (`c`, `c2`, … or `vec2`, `vec2_2`). */
export function freeName(definition: Definition, base: string): string {
  const taken = new Set([
    ...definition.inputs.map((i) => i.name),
    ...definition.cells.map((c) => c.name),
    ...definition.functions.map((f) => f.name),
  ]);
  const clean = base.replace(/[^\w$]/g, '_').replace(/^(\d)/, '_$1') || 'value';
  const sep = /\d$/.test(clean) ? '_' : '';
  let name = nameProblem(clean) ? `${clean}_` : clean;
  for (let i = 2; taken.has(name) || nameProblem(name); i++) name = `${clean}${sep}${i}`;
  return name;
}

/** Throws when `name` cannot name a new binding (or `except`'s new name). */
function checkName(definition: Definition, name: string, except?: string) {
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  const taken = [...definition.inputs, ...definition.cells, ...definition.functions].some(
    (b) => b.name === name && b.name !== except,
  );
  if (taken) throw new Error(`${name} is already used`);
}

const mapCells = (definition: Definition, f: (cell: Cell, index: number) => Cell): Definition => ({
  ...definition,
  cells: definition.cells.map(f),
});
const replaceIn = (e: Expr, match: (e: Expr) => boolean, by: (e: Expr) => Expr) =>
  mapExpr(e, (x) => (match(x) ? by(x) : x));

// ---- inputs ----

/** The value a new input or a fresh argument of `type` starts with. */
export function defaultValue(type: string): Expr {
  if (type === 'boolean') return false;
  if (type === 'string') return '';
  if (type in DEFAULT_VALUES) return { value: DEFAULT_VALUES[type] };
  return DEFAULT_NUMBER[type] ?? 0;
}

export function addInput(definition: Definition, type = 'Coordinate', name?: string): Definition {
  const input: Input = { name: name ?? freeName(definition, 'input'), type, value: defaultValue(type) };
  checkName(definition, input.name);
  return { ...definition, inputs: [...definition.inputs, input] };
}

export const setInput = (definition: Definition, name: string, patch: Partial<Input>): Definition => ({
  ...definition,
  inputs: definition.inputs.map((input) => (input.name === name ? { ...input, ...patch } : input)),
});

/** An input's type changes, and its value with it. */
export const setInputType = (definition: Definition, name: string, type: string): Definition =>
  setInput(definition, name, { type, value: defaultValue(type) });

/** Removes an input; where it was used, its value is written instead. */
export function removeInput(definition: Definition, name: string): Definition {
  const input = definition.inputs.find((i) => i.name === name);
  if (!input) return definition;
  const without = { ...definition, inputs: definition.inputs.filter((i) => i !== input) };
  return mapCells(without, (cell) => ({ ...cell, expr: replaceIn(cell.expr, refTo(name), () => input.value) }));
}

// ---- cells ----

/** Adds a cell holding `expr` (after `after`, or at the end). */
export function addCell(
  definition: Definition,
  expr: Expr,
  options: { name?: string; after?: string } = {},
): Definition {
  const name = options.name ?? freeName(definition, nameFor(expr));
  checkName(definition, name);
  const at = options.after === undefined ? definition.cells.length : cellIndex(definition, options.after) + 1;
  const cells = [...definition.cells];
  cells.splice(at, 0, { name, expr });
  return { ...definition, cells };
}
/** A cell name from what it holds: `vec2` for `new Vec2(…)`, `evaluate` for `x.evaluate(…)`. */
export function nameFor(expr: Expr): string {
  if (isObj(expr) && 'op' in expr) {
    const [owner, member] = expr.op.split('.') as [string, string];
    return member === 'new' ? owner.charAt(0).toLowerCase() + owner.slice(1) : member;
  }
  if (isObj(expr) && 'call' in expr) return expr.call;
  if (isObj(expr) && 'field' in expr) return expr.field;
  return 'value';
}
const cellIndex = (definition: Definition, name: string) => {
  const index = definition.cells.findIndex((c) => c.name === name);
  if (index < 0) throw new Error(`No cell ${name}`);
  return index;
};

export const setCell = (definition: Definition, name: string, patch: Partial<Cell>): Definition =>
  mapCells(definition, (cell) => {
    if (cell.name !== name) return cell;
    const next: Cell = { ...cell, ...patch };
    if (next.type === undefined || next.type === '') delete next.type;
    if (!next.output) delete next.output;
    return next;
  });

/** Replaces the expression at `path` in a cell (`undefined` removes an argument). */
export const setCellExpr = (definition: Definition, name: string, path: ExprPath, expr: Expr | undefined) =>
  mapCells(definition, (cell) => (cell.name === name ? { ...cell, expr: setAt(cell.expr, path, expr) } : cell));

/** Renames an input, a cell or a function, and every use of it. */
export function rename(definition: Definition, from: string, to: string): Definition {
  if (from === to) return definition;
  checkName(definition, to, from);
  const fn = definition.functions.some((f) => f.name === from);
  const renameIn = (e: Expr) =>
    mapExpr(e, (x) =>
      isObj(x) && 'ref' in x && x.ref === from && !fn
        ? { ref: to }
        : isObj(x) && 'call' in x && x.call === from && fn
          ? { ...x, call: to }
          : x,
    );
  return {
    ...definition,
    inputs: definition.inputs.map((i) => (i.name === from ? { ...i, name: to } : i)),
    functions: definition.functions.map((f) => ({
      ...f,
      name: f.name === from ? to : f.name,
      body: fn ? renameIn(f.body) : f.body,
    })),
    cells: definition.cells.map((c) => ({ ...c, name: c.name === from ? to : c.name, expr: renameIn(c.expr) })),
  };
}

/** Removes a cell; the cells that used it get its expression in its place. */
export function removeCell(definition: Definition, name: string): Definition {
  const cell = definition.cells[cellIndex(definition, name)]!;
  const without = { ...definition, cells: definition.cells.filter((c) => c !== cell) };
  return mapCells(without, (c) => ({ ...c, expr: replaceIn(c.expr, refTo(name), () => cell.expr) }));
}

// ---- functions ----

export function addFunction(definition: Definition): Definition {
  const name = freeName(definition, 'f');
  const fn: Fn = { name, params: [{ name: 'x', type: 'Coordinate' }], body: { ref: 'x' } };
  return { ...definition, functions: [...definition.functions, fn] };
}

const mapFunction = (definition: Definition, name: string, f: (fn: Fn) => Fn): Definition => ({
  ...definition,
  functions: definition.functions.map((fn) => (fn.name === name ? f(fn) : fn)),
});
export const setFunctionBody = (definition: Definition, name: string, path: ExprPath, expr: Expr | undefined) =>
  mapFunction(definition, name, (fn) => ({ ...fn, body: setAt(fn.body, path, expr) }));

/** `fn`'s body with its params replaced by `args`. */
const inline = (fn: Fn, args: Record<string, Expr> = {}) =>
  mapExpr(fn.body, (x) => (isObj(x) && 'ref' in x && x.ref in args ? args[x.ref]! : x));

/** Removes a function; its calls get its body with the arguments in place of its params. */
export function removeFunction(definition: Definition, name: string): Definition {
  const fn = definition.functions.find((f) => f.name === name);
  if (!fn) return definition;
  const expand = (e: Expr): Expr =>
    mapExpr(e, (x) => (isObj(x) && 'call' in x && x.call === name ? inline(fn, x.args) : x));
  return {
    ...definition,
    functions: definition.functions.filter((f) => f !== fn).map((f) => ({ ...f, body: expand(f.body) })),
    cells: definition.cells.map((c) => ({ ...c, expr: expand(c.expr) })),
  };
}

/** Rewrites the calls of `name` with `f` (after its params changed). */
const mapCalls = (definition: Definition, name: string, f: (args: Record<string, Expr>) => Record<string, Expr>) => {
  const rewrite = (e: Expr) =>
    mapExpr(e, (x) => {
      if (!(isObj(x) && 'call' in x && x.call === name)) return x;
      const args = f(x.args ?? {});
      return Object.keys(args).length ? { call: name, args } : { call: name };
    });
  return {
    ...definition,
    functions: definition.functions.map((fn) => ({ ...fn, body: rewrite(fn.body) })),
    cells: definition.cells.map((c) => ({ ...c, expr: rewrite(c.expr) })),
  };
};

export function addParam(definition: Definition, fnName: string, type = 'Coordinate'): Definition {
  const fn = definition.functions.find((f) => f.name === fnName)!;
  let name = 'x';
  for (let i = 2; fn.params.some((p) => p.name === name); i++) name = `x${i}`;
  const value = defaultValue(type);
  const next = mapFunction(definition, fnName, (f) => ({ ...f, params: [...f.params, { name, type }] }));
  return mapCalls(next, fnName, (args) => ({ ...args, [name]: value }));
}

/** Removes a param: its uses in the body become its type's default value; calls drop the argument. */
export function removeParam(definition: Definition, fnName: string, param: string): Definition {
  const fn = definition.functions.find((f) => f.name === fnName)!;
  const removed = fn.params.find((p) => p.name === param);
  if (!removed) return definition;
  const next = mapFunction(definition, fnName, (f) => ({
    ...f,
    params: f.params.filter((p) => p !== removed),
    body: replaceIn(f.body, refTo(param), () => defaultValue(removed.type)),
  }));
  return mapCalls(next, fnName, ({ [param]: _, ...rest }) => rest);
}

export function setParamType(definition: Definition, fnName: string, param: string, type: string): Definition {
  parseTypeName(type);
  return mapFunction(definition, fnName, (f) => ({
    ...f,
    params: f.params.map((p) => (p.name === param ? { ...p, type } : p)),
  }));
}

// ---- expressions ----

/** A fresh expression for a slot of `type`: a number literal, the latest binding that fits, else a default literal. */
export function defaultExpr(type: Type, scope: Scope): Expr | undefined {
  // A number starts as a literal: the latest number in scope (an area, a count) is rarely the one meant.
  if (roleOf(type)) return defaultLiteral(type);
  const binding = [...scope].reverse().find((b) => assignable(b.type, type));
  if (binding) return { ref: binding.name };
  return defaultLiteral(type);
}

/**
 * `id` in place of `current`: arguments are kept by name where they still fit, `current` itself becomes the value
 * acted on or the first argument it fits, and required arguments left over get a default.
 */
export function changeOp(current: Expr | undefined, id: string, scope: Scope, typeOf: (e: Expr) => Type): Expr {
  const op = operationById.get(id);
  if (!op) throw new Error(`${id} is not a vec2 operation`);
  const old = current !== undefined && isObj(current) && 'op' in current ? current : undefined;
  const args: Record<string, Expr> = {};
  let self: Expr | undefined;
  const fits = (e: Expr | undefined, type: Type) => e !== undefined && assignable(typeOf(e), type);
  const keeps = (name: string, slot: (typeof op.params)[number][1]) => {
    const kept = old?.args?.[name];
    return kept !== undefined && (isRest(slot) ? Array.isArray(kept) : fits(kept, slotType(slot)));
  };
  // Nothing of the old operation carries over: then the old expression goes into the new one.
  const carries = (!op.static && fits(old?.self, op.owner)) || op.params.some(([name, slot]) => keeps(name, slot));
  let placed = carries;
  if (!op.static) {
    if (carries && fits(old?.self, op.owner)) self = old!.self;
    else if (!placed && fits(current, op.owner)) [self, placed] = [current, true];
  }
  for (const [name, slot] of op.params) {
    const type = slotType(slot);
    if (keeps(name, slot)) {
      args[name] = old!.args![name]!;
      continue;
    }
    if (!placed && current !== undefined && fits(current, type)) {
      args[name] = isRest(slot) ? [current] : current;
      placed = true;
      continue;
    }
    if (isOptional(slot) || isRest(slot)) continue;
    const fresh = defaultExpr(type, scope);
    if (fresh !== undefined) args[name] = fresh;
  }
  if (!op.static && self === undefined) self = defaultExpr(op.owner, scope);
  return { op: id, ...(self !== undefined && { self }), ...(Object.keys(args).length && { args }) };
}

const packable = new Map(PACKABLE_TYPES.map((name) => [name, parseTypeName(name)]));
/** The types an output whose value is `inferred` can declare: its own first, then every wider one (`Geometry2`). */
export function outputTypes(inferred: Type): string[] {
  if (inferred === 'unknown') return [];
  const own = nonNull(inferred);
  const wider = [...packable].filter(([, type]) => assignable(own, type)).map(([name]) => name);
  // Plain names only (a class, a named type, a number type): unions read badly as a choice.
  return [...new Set([typeName(own), ...wider.filter((name) => /^\w+(\[\])?$/.test(name))])].filter((name) =>
    packable.has(name),
  );
}

/** The instance methods and fields of a value of `type` (what can be chained onto it). */
export const methodsOf = (type: Type) => {
  const owners = new Set(members(type).filter((m): m is string => typeof m === 'string' && isClass(m)));
  return operations.filter((op) => owners.has(op.owner) && !op.static);
};

/** A field or an item that can be read off a value: `x.polygons`, `x[0]`. */
export type Part = { field: string } | { index: number };
const isFields = (t: Type): t is Record<string, unknown> =>
  !!t && typeof t === 'object' && !Array.isArray(t) && !['or', 'enum', 'tuple', 'record'].some((k) => isKind(t, k));
/** The fields of an object value (`Boolean2Result`), or the items of a tuple, or the first item of a list. */
export function partsOf(type: Type): Part[] {
  const ms = members(type).filter((m) => m !== 'null');
  if (!ms.length) return [];
  if (ms.every(isFields))
    return Object.keys(ms[0]!)
      .filter((field) => ms.every((m) => field in m))
      .map((field) => ({ field }));
  const lengths = ms.map((m) =>
    Array.isArray(m) ? 1 : isKind(m, 'tuple') ? (m as { tuple: Type[] }).tuple.length : 0,
  );
  return Array.from({ length: Math.min(...lengths) }, (_, index) => ({ index }));
}

/** The value a method call (`self`) or a field or item (`of`) is read from: what is left when it is removed. */
export function unchain(e: Expr | undefined): Expr | undefined {
  if (e === undefined || !isObj(e)) return undefined;
  if ('of' in e) return e.of;
  return 'op' in e && e.self !== undefined && !operationById.get(e.op)?.static ? e.self : undefined;
}

/** A field or item read off a new value: kept where the new value has it, else the new value alone. */
export function replaceOf(e: { of: Expr } & Part, of: Expr, typeOf: (e: Expr) => Type): Expr {
  const next = { ...e, of };
  return typeOf(next) !== 'unknown' || typeOf(of) === 'unknown' ? next : of;
}

/** `current.id(…)`: a method or field of `current`, its required arguments defaulted. */
export function chain(current: Expr, id: string, scope: Scope): Expr {
  const op = operationById.get(id);
  if (!op || op.static) throw new Error(`${id} is not a method`);
  const args = Object.fromEntries(
    op.params.flatMap(([name, slot]) => {
      const fresh = isOptional(slot) || isRest(slot) ? undefined : defaultExpr(slotType(slot), scope);
      return fresh === undefined ? [] : [[name, fresh]];
    }),
  );
  return { op: id, self: current, ...(Object.keys(args).length && { args }) };
}

/** A call of user function `fn`, its arguments defaulted (`current` placed in the first param it fits). */
export function callFunction(current: Expr | undefined, fn: Fn, scope: Scope, typeOf: (e: Expr) => Type): Expr {
  let placed = false;
  const args = Object.fromEntries(
    fn.params.map((p) => {
      const type = parseTypeName(p.type);
      if (!placed && current !== undefined && assignable(typeOf(current), type)) {
        placed = true;
        return [p.name, current];
      }
      return [p.name, defaultExpr(type, scope) ?? defaultValue(p.type)];
    }),
  );
  return { call: fn.name, ...(fn.params.length && { args }) };
}

/** Arithmetic around `current`: `current op 1`, or `-current`. */
export const wrapMath = (current: Expr, op: '+' | '-' | '*' | '/' | 'neg'): Expr =>
  op === 'neg' ? { math: 'neg', args: [current] } : { math: op, args: [current, op === '+' || op === '-' ? 0 : 1] };

/** The types of the inputs and the cells before `cell` (all of them without `cell`), for pickers. */
export function scopeOf(definition: Definition, cell?: string): Scope {
  const { refs } = checkDefinition(definition);
  const before = cell === undefined ? definition.cells : definition.cells.slice(0, cellIndex(definition, cell));
  return [...definition.inputs, ...before].map((b) => ({ name: b.name, type: refs.get(b.name) ?? 'unknown' }));
}
