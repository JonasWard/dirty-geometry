/**
 * Types of version 4 definitions: what each expression is, whether it fits where it is used, and every problem in a
 * definition. Types are the schema's compact types (`Vec2`, `[Vec2]`, `{ or }`, `{ enum }`, `{ tuple }`, …).
 *
 * - Numbers are one family: `number` and every semantic number type fit each other. The semantic type of a slot only
 *   decides how a literal in it is packed.
 * - A literal's type is the literal itself (`{ enum: [0.5] }`), so it fits enumerations such as `AnglePrecisions`.
 * - A result that may be `null` fits a slot of the non-null type: the playground reports the failure when it runs.
 */
import type { Definition, Expr } from '../src/recording/definition';
import {
  classes,
  classJson,
  classOfTag,
  isKind,
  isOptional,
  isRest,
  NUMBER_TYPES,
  operationById,
  resolve,
  slotType,
  type Operation,
  type Slot,
  type Type,
} from './schema';

export type { Type };
const NUMERIC = new Set(['number', ...NUMBER_TYPES]);
/** Classes that are values (they have a JSON form); the others only hold static operations. */
export const VALUE_CLASSES: readonly string[] = Object.keys(classJson);
const CLASS_SET = new Set(classes);
export const isNumeric = (type: Type) => typeof type === 'string' && NUMERIC.has(type);
const isObjectType = (type: Type): type is Record<string, Slot> =>
  !!type &&
  typeof type === 'object' &&
  !Array.isArray(type) &&
  !['or', 'enum', 'tuple', 'record'].some((kind) => isKind(type, kind));

/** A named shape replaced by its body, and unions flattened: the members a value of `type` can be. */
export function members(type: Type): Type[] {
  const t = typeof type === 'string' && !CLASS_SET.has(type) && !NUMERIC.has(type) ? resolve(type) : type;
  return isKind(t, 'or') ? (t as { or: Type[] }).or.flatMap(members) : [t];
}

/** `type` written like TypeScript: `Vec2[]`, `Aabb2 | Vec2`, `[Index, Index]`, `{ min: Coordinate }`. */
export function typeName(type: Type): string {
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) {
    const item = typeName(type[0]!);
    return /[ |]/.test(item) && !/^[[{]/.test(item) ? `(${item})[]` : `${item}[]`;
  }
  const t = type as Record<string, any>;
  if (isKind(t, 'or')) return [...new Set(t.or.map(typeName))].sort().join(' | ');
  if (isKind(t, 'tuple')) return `[${t.tuple.map(typeName).join(', ')}]`;
  if (isKind(t, 'enum')) return t.enum.map((v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
  if (isKind(t, 'record')) return `Record<number, ${typeName(t.record)}>`;
  if (Object.keys(t).length === 0) return '{}';
  return `{ ${Object.entries(t)
    .map(([k, slot]) => `${k}${isOptional(slot) ? '?' : ''}: ${typeName(slotType(slot))}`)
    .join(', ')} }`;
}

/** The inverse of {@link typeName} (any spacing and union order). */
export function parseTypeName(text: string): Type {
  let i = 0;
  const peek = () => text[skip()];
  const skip = () => {
    while (/\s/.test(text[i] ?? '')) i++;
    return i;
  };
  const expect = (c: string) => {
    if (text[skip()] !== c) throw new Error(`Expected "${c}" at ${i} in type ${text}`);
    i++;
  };
  const union = (): Type => {
    const items = [postfix()];
    while (peek() === '|') {
      i++;
      items.push(postfix());
    }
    if (items.length === 1) return items[0]!;
    const literal = items.every((t) => isKind(t, 'enum') || t === 'null');
    if (literal) return { enum: items.flatMap((t) => (t === 'null' ? [null] : (t as { enum: unknown[] }).enum)) };
    return { or: items };
  };
  const postfix = (): Type => {
    let t = atom();
    while (text.slice(skip(), i + 2) === '[]') {
      i += 2;
      t = [t];
    }
    return t;
  };
  const atom = (): Type => {
    const c = text[skip()];
    if (c === '(') {
      i++;
      const t = union();
      expect(')');
      return t;
    }
    if (c === '[') {
      i++;
      const tuple: Type[] = [];
      while (peek() !== ']') {
        tuple.push(union());
        if (peek() === ',') i++;
      }
      i++;
      return { tuple };
    }
    if (c === '{') {
      i++;
      const fields: Record<string, Slot> = {};
      while (peek() !== '}') {
        const name = /^[\w$]+/.exec(text.slice(skip()))?.[0] ?? '';
        if (!name) throw new Error(`Expected a field name at ${i} in type ${text}`);
        i += name.length;
        const optional = peek() === '?';
        if (optional) i++;
        expect(':');
        const t = union();
        fields[name] = optional ? { type: t, optional: true } : t;
        if (peek() === ',' || peek() === ';') i++;
      }
      i++;
      return fields;
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const value = text.slice(i + 1, end);
      i = end + 1;
      return { enum: [value] };
    }
    const word = /^[-\w$.]+/.exec(text.slice(i))?.[0];
    if (!word) throw new Error(`Unexpected "${c ?? 'end'}" at ${i} in type ${text}`);
    i += word.length;
    if (word === 'Record') {
      expect('<');
      union();
      expect(',');
      const record = union();
      expect('>');
      return { record };
    }
    if (/^-?[\d.]+$/.test(word)) return { enum: [Number(word)] };
    if (word === 'true' || word === 'false') return { enum: [word === 'true'] };
    return word;
  };
  const type = union();
  if (skip() < text.length) throw new Error(`Unexpected "${text[i]}" at ${i} in type ${text}`);
  return type;
}

/** Whether every value of `from` is a value of `to`. */
export function assignable(from: Type, to: Type): boolean {
  if (from === 'unknown' || to === 'unknown') return true;
  const all = members(from);
  const nonNull = all.filter((m) => m !== 'null');
  const targets = members(to);
  return (nonNull.length ? nonNull : all).every((m) => targets.some((t) => fits(m, t)));
}

function fits(m: Type, t: Type): boolean {
  if (typeof m === 'string' && typeof t === 'string')
    return m === t || (NUMERIC.has(m) && NUMERIC.has(t)) || (m === 'boolean' && t === 'boolean');
  if (m === 'null') return isKind(t, 'enum') && (t as { enum: unknown[] }).enum.includes(null);
  if (isKind(m, 'enum'))
    return (m as { enum: unknown[] }).enum.every((v) =>
      isKind(t, 'enum')
        ? (t as { enum: unknown[] }).enum.includes(v)
        : v === null
          ? t === 'null'
          : typeof v === 'number'
            ? isNumeric(t)
            : t === typeof v,
    );
  if (Array.isArray(m)) return Array.isArray(t) && assignable(m[0]!, t[0]!);
  if (isKind(m, 'tuple')) {
    const items = (m as { tuple: Type[] }).tuple;
    if (Array.isArray(t)) return items.every((item) => assignable(item, t[0]!));
    if (isKind(t, 'tuple')) {
      const target = (t as { tuple: Type[] }).tuple;
      return items.length === target.length && items.every((item, i) => assignable(item, target[i]!));
    }
    return false;
  }
  if (isKind(m, 'record')) return isKind(t, 'record') && assignable((m as any).record, (t as any).record);
  if (isObjectType(m)) {
    if (isKind(t, 'record')) return Object.values(m).every((slot) => assignable(slotType(slot), (t as any).record));
    if (!isObjectType(t)) return false;
    const target = t as Record<string, Slot>;
    return (
      Object.keys(m).every((key) => key in target) &&
      Object.entries(target).every(([key, slot]) =>
        key in m ? assignable(slotType(m[key]!), slotType(slot)) : isOptional(slot),
      )
    );
  }
  return false;
}

/** The number type a literal in a slot of `type` is packed as (`Coordinate` when the slot says only `number`). */
export function roleOf(type: Type): string | undefined {
  const numbers = members(type).filter((m): m is string => typeof m === 'string' && NUMERIC.has(m));
  if (!numbers.length) return undefined;
  return numbers.find((m) => m !== 'number') ?? 'Coordinate';
}

/** A literal's type widened to its kind (`{ enum: [2] }` → `number`), for a cell's own type. */
export function widen(type: Type): Type {
  if (isKind(type, 'enum')) {
    const kinds = [...new Set((type as { enum: unknown[] }).enum.map((v) => (v === null ? 'null' : typeof v)))];
    return kinds.length === 1 ? kinds[0]! : { or: kinds };
  }
  if (isKind(type, 'tuple')) {
    const items = [...new Map((type as { tuple: Type[] }).tuple.map((t) => [typeName(widen(t)), widen(t)])).values()];
    return items.length === 0 ? ['unknown'] : [items.length === 1 ? items[0]! : { or: items }];
  }
  if (isObjectType(type)) return Object.fromEntries(Object.entries(type).map(([k, s]) => [k, widen(slotType(s))]));
  return type;
}

/** Where a problem is: an input, a function or a cell, and the path inside its expression. */
export type Issue = { kind: 'input' | 'function' | 'cell'; name: string; path: (string | number)[]; message: string };
export type FnType = { params: { name: string; type: Type }[]; returns: Type };
export type Scope = { refs: ReadonlyMap<string, Type>; fns: ReadonlyMap<string, FnType> };

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** Words a name may not be (TypeScript keywords and what the printed code uses). */
export const RESERVED: ReadonlySet<string> = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
    'yield let static implements interface package private protected public await as async of type undefined ' +
    'Infinity NaN Math value definition helpers Record'
  ).split(' '),
);
/** Why `name` cannot name an input, cell, function or param, if it cannot. */
export function nameProblem(name: string): string | undefined {
  if (!IDENTIFIER.test(name)) return `"${name}" is not a name (letters, digits, _ and $; not starting with a digit)`;
  if (RESERVED.has(name)) return `"${name}" is a reserved word`;
  if (CLASS_SET.has(name) || operationById.has(`helpers.${name}`) || NUMERIC.has(name))
    return `"${name}" is a vec2 name`;
  return undefined;
}

/** Types every expression of an input, function or cell; problems go to `issues`. */
export function typer(issues: Issue[], kind: Issue['kind'], name: string) {
  const report = (path: (string | number)[], message: string): Type => {
    issues.push({ kind, name, path, message });
    return 'unknown';
  };
  const check = (expr: Expr | undefined, slot: Type, scope: Scope, path: (string | number)[], what: string) => {
    if (expr === undefined) return void report(path, `${what} is missing`);
    const type = typeOf(expr, scope, path);
    if (!assignable(type, slot)) report(path, `${what} is ${typeName(widen(type))}; ${typeName(slot)} expected`);
  };
  function args(
    params: readonly [string, Slot][],
    given: Record<string, Expr>,
    scope: Scope,
    path: (string | number)[],
    label: string,
  ) {
    for (const key of Object.keys(given))
      if (!params.some(([p]) => p === key)) report([...path, 'args', key], `${label} has no parameter ${key}`);
    for (const [param, s] of params) {
      const at = [...path, 'args', param];
      const value = given[param];
      if (value === undefined) {
        if (!isOptional(s) && !isRest(s)) report(at, `${label}: ${param} is missing`);
      } else if (isRest(s)) {
        if (!Array.isArray(value)) report(at, `${label}: ${param} takes a list of items`);
        else value.forEach((item, i) => check(item, slotType(s), scope, [...at, i], `${param}[${i}]`));
      } else check(value, slotType(s), scope, at, param);
    }
  }
  function op(expr: { op: string; self?: Expr; args?: Record<string, Expr> }, scope: Scope, path: (string | number)[]) {
    const operation: Operation | undefined = operationById.get(expr.op);
    if (!operation) return report(path, `${expr.op} is not a vec2 operation`);
    if (operation.static && expr.self !== undefined) report([...path, 'self'], `${expr.op} takes no value to act on`);
    if (!operation.static) check(expr.self, operation.owner, scope, [...path, 'self'], `the ${operation.owner}`);
    if (operation.value && expr.args && Object.keys(expr.args).length) report(path, `${expr.op} is a field`);
    args(operation.params, expr.args ?? {}, scope, path, expr.op);
    return operation.returns;
  }
  function typeOf(expr: Expr, scope: Scope, path: (string | number)[] = []): Type {
    if (expr === null) return 'null';
    if (typeof expr !== 'object') {
      if (typeof expr === 'number' && !Number.isFinite(expr)) return report(path, 'write Infinity or NaN as such');
      return { enum: [expr] };
    }
    if (Array.isArray(expr)) return { tuple: expr.map((item, i) => typeOf(item, scope, [...path, i])) };
    if ('number' in expr) return 'number';
    if ('value' in expr) {
      const tag = (expr.value as { type?: unknown } | null)?.type;
      return classOfTag[String(tag)] ?? report(path, `${String(tag)} is not a vec2 value`);
    }
    if ('object' in expr)
      return Object.fromEntries(
        Object.entries(expr.object).map(([key, value]) => [key, typeOf(value, scope, [...path, 'object', key])]),
      );
    if ('ref' in expr) return scope.refs.get(expr.ref) ?? report(path, `${expr.ref} is not defined here`);
    if ('op' in expr) return op(expr, scope, path);
    if ('call' in expr) {
      const fn = scope.fns.get(expr.call);
      if (!fn) return report(path, `${expr.call} is not a function defined before here`);
      args(
        fn.params.map((p) => [p.name, p.type] as [string, Slot]),
        expr.args ?? {},
        scope,
        path,
        expr.call,
      );
      return fn.returns;
    }
    if ('math' in expr) {
      expr.args.forEach((arg, i) => check(arg, 'number', scope, [...path, 'args', i], 'an operand'));
      return 'number';
    }
    const of = typeOf(expr.of, scope, [...path, 'of']);
    if (of === 'unknown') return of;
    const ms = members(of).filter((m) => m !== 'null');
    if ('index' in expr) {
      const items = ms.map((m) =>
        Array.isArray(m) ? m[0]! : isKind(m, 'tuple') ? (m as { tuple: Type[] }).tuple[expr.index] : undefined,
      );
      if (!items.length || items.some((t) => t === undefined))
        return report(path, `${typeName(widen(of))} has no item ${expr.index}`);
      return items.length === 1 ? items[0]! : { or: items as Type[] };
    }
    const fields = ms.map((m) => (isObjectType(m) && expr.field in m ? m[expr.field] : undefined));
    if (!fields.length || fields.some((f) => f === undefined))
      return report(path, `${typeName(widen(of))} has no field ${expr.field}`);
    const slots = fields.map((f) => (isOptional(f!) ? { or: [slotType(f!), 'null'] } : slotType(f!)));
    return slots.length === 1 ? slots[0]! : { or: slots };
  }
  return { typeOf, check, report };
}

export type Analysis = {
  /** Every input's and cell's type, and every function's signature. */
  refs: Map<string, Type>;
  fns: Map<string, FnType>;
  issues: Issue[];
};

const INPUT_TYPES = new Set([...NUMBER_TYPES, 'boolean', 'string', ...VALUE_CLASSES]);
/** The types an input can have. */
export const inputTypes = (): string[] => [...INPUT_TYPES];

/** Types and checks a whole definition: names, scopes, operations and their arguments. */
export function checkDefinition(definition: Definition): Analysis {
  const issues: Issue[] = [];
  const refs = new Map<string, Type>();
  const fns = new Map<string, FnType>();
  const taken = new Map<string, string>();
  const claim = (kind: Issue['kind'], name: string) => {
    const problem = nameProblem(name) ?? (taken.has(name) ? `${name} is already a ${taken.get(name)}` : undefined);
    if (problem) issues.push({ kind, name, path: [], message: problem });
    taken.set(name, kind);
  };
  const parse = (kind: Issue['kind'], name: string, text: string): Type => {
    try {
      return parseTypeName(text);
    } catch (error) {
      issues.push({ kind, name, path: [], message: (error as Error).message });
      return 'unknown';
    }
  };

  for (const fn of definition.functions) {
    claim('function', fn.name);
    const { typeOf } = typer(issues, 'function', fn.name);
    const params = fn.params.map((p) => ({ name: p.name, type: parse('function', fn.name, p.type) }));
    const seen = new Set<string>();
    for (const p of fn.params) {
      const problem = nameProblem(p.name) ?? (seen.has(p.name) ? `param ${p.name} appears twice` : undefined);
      if (problem) issues.push({ kind: 'function', name: fn.name, path: ['params', p.name], message: problem });
      seen.add(p.name);
    }
    const scope = { refs: new Map(params.map((p) => [p.name, p.type])), fns: new Map(fns) };
    fns.set(fn.name, { params, returns: widen(typeOf(fn.body, scope)) });
  }
  for (const input of definition.inputs) {
    claim('input', input.name);
    const { typeOf, report } = typer(issues, 'input', input.name);
    if (!INPUT_TYPES.has(input.type)) report([], `an input cannot be a ${input.type}`);
    const literal =
      input.value === null ||
      typeof input.value !== 'object' ||
      'value' in (input.value as object) ||
      'number' in (input.value as object);
    if (!literal) report([], 'an input holds a literal value');
    else if (!assignable(typeOf(input.value, { refs, fns }), input.type))
      report([], `the value does not fit ${input.type}`);
    refs.set(input.name, INPUT_TYPES.has(input.type) ? input.type : 'unknown');
  }
  for (const cell of definition.cells) {
    claim('cell', cell.name);
    const { typeOf, report } = typer(issues, 'cell', cell.name);
    const inferred = widen(typeOf(cell.expr, { refs: new Map(refs), fns }));
    let type = inferred;
    if (cell.type !== undefined) {
      type = parse('cell', cell.name, cell.type);
      if (!assignable(inferred, type)) report([], `${typeName(inferred)} does not fit the declared ${cell.type}`);
    }
    refs.set(cell.name, type);
  }
  return { refs, fns, issues };
}
