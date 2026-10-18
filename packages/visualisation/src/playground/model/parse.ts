/**
 * Reads the code `printDefinition` writes (and edits of it) back into a definition. The language is a small part of
 * TypeScript: imports (ignored), `function name(p: Type, …) { return expr; }`, and
 * `export function definition(input: Type = literal, …) { const cell[: Type] = expr; … return { outputs }; }`.
 *
 * Expressions are calls (`new Vec2(1, 2)`, `Vec2.center(a, b)`, `a.add(b)`, `convexHullLoop(points)`, `rim(c, 0.5)`),
 * field reads (`line.from`, `result.polygons`, `points[0]`), arithmetic (`+ - * /`, unary `-`), literals, lists,
 * options objects and stored values (`value({ type: 'Vec2', x: 1, y: 2 })`). Which operation `a.add(b)` is follows
 * from the type of `a`, so cells are resolved in order.
 */
import type { Cell, Definition, Expr, Fn, Input } from '@dirty-geometry/vec2/recording/definition';
import { isOptional, isRest, operationById, type Slot, type Type } from '@dirty-geometry/vec2/schema/schema';
import {
  isClass,
  members,
  parseTypeName,
  typeName,
  typer,
  widen,
  type FnType,
} from '@dirty-geometry/vec2/schema/typing';

/** A problem in the code, with where it is (offsets into the text, and the 1-based line and column of `from`). */
export class CodeError extends Error {
  override name = 'CodeError';
  constructor(
    message: string,
    readonly from: number,
    readonly to: number,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${line}:${column} ${message}`);
  }
}

type Token = {
  kind: 'name' | 'number' | 'string' | 'punct' | 'end';
  text: string;
  value?: unknown;
  from: number;
  to: number;
};
const PUNCT = [
  '...',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ';',
  ':',
  '.',
  '=',
  '?',
  '!',
  '|',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
];

function lex(text: string, error: (message: string, from: number, to: number) => never): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) error('A comment is not closed', i, text.length);
      i = end + 2;
      continue;
    }
    const from = i;
    if (/[A-Za-z_$]/.test(c)) {
      while (/[\w$]/.test(text[i] ?? '')) i++;
      tokens.push({ kind: 'name', text: text.slice(from, i), from, to: i });
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(text.slice(i))!;
      i += m[0].length;
      tokens.push({ kind: 'number', text: m[0], value: Number(m[0]), from, to: i });
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let value = '';
      i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\n') error('A string is not closed', from, i);
        if (text[i] === '\\') {
          const next = text[i + 1] ?? '';
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
        } else value += text[i++];
      }
      if (i >= text.length) error('A string is not closed', from, i);
      i++;
      tokens.push({ kind: 'string', text: text.slice(from, i), value, from, to: i });
      continue;
    }
    const punct = PUNCT.find((p) => text.startsWith(p, i));
    if (!punct) error(`Unexpected "${c}"`, i, i + 1);
    i += punct!.length;
    tokens.push({ kind: 'punct', text: punct!, from, to: i });
  }
  tokens.push({ kind: 'end', text: 'end of the code', from: text.length, to: text.length });
  return tokens;
}

/** The syntax, before names and operations are resolved. */
type Node = { from: number; to: number } & (
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'name'; name: string }
  | { kind: 'list'; items: Arg[] }
  | { kind: 'object'; fields: [string, Node][] }
  | { kind: 'new'; owner: string; args: Arg[] }
  | { kind: 'call'; callee: Node; args: Arg[] }
  | { kind: 'member'; of: Node; name: string; nameFrom: number }
  | { kind: 'index'; of: Node; index: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { kind: 'neg'; a: Node }
);
type Arg = { spread: boolean; node: Node };

export function parseDefinition(text: string): Definition {
  const lines = text.slice(0).split('\n');
  const error = (message: string, from: number, to = from + 1): never => {
    let line = 0;
    let rest = from;
    while (line < lines.length - 1 && rest > lines[line]!.length) rest -= lines[line++]!.length + 1;
    throw new CodeError(message, from, to, line + 1, rest + 1);
  };
  const tokens = lex(text, error);
  let at = 0;
  const peek = (offset = 0) => tokens[Math.min(at + offset, tokens.length - 1)]!;
  const next = () => tokens[at++]!;
  const is = (text: string, offset = 0) => peek(offset).text === text && peek(offset).kind !== 'string';
  const eat = (text: string) => (is(text) ? (next(), true) : false);
  const expect = (text: string, what = `"${text}"`) => {
    const token = peek();
    if (token.text !== text || token.kind === 'string')
      error(`Expected ${what}, found ${token.text}`, token.from, token.to);
    return next();
  };
  const name = (what: string) => {
    const token = peek();
    if (token.kind !== 'name') error(`Expected ${what}, found ${token.text}`, token.from, token.to);
    return next();
  };

  // ---- expressions ----
  const list = (close: string): Arg[] => {
    const items: Arg[] = [];
    while (!is(close)) {
      const spread = eat('...');
      items.push({ spread, node: expression() });
      if (!eat(',')) break;
    }
    expect(close);
    return items;
  };
  function primary(): Node {
    const token = next();
    const span = { from: token.from, to: token.to };
    if (token.kind === 'number') return { kind: 'literal', value: token.value as number, ...span };
    if (token.kind === 'string') return { kind: 'literal', value: token.value as string, ...span };
    if (token.kind === 'name') {
      if (token.text === 'true' || token.text === 'false')
        return { kind: 'literal', value: token.text === 'true', ...span };
      if (token.text === 'null') return { kind: 'literal', value: null, ...span };
      if (token.text === 'new') {
        const owner = name('a class');
        expect('(');
        const args = list(')');
        return { kind: 'new', owner: owner.text, args, from: token.from, to: tokens[at - 1]!.to };
      }
      return { kind: 'name', name: token.text, ...span };
    }
    if (token.text === '(') {
      const inner = expression();
      expect(')');
      return { ...inner, from: token.from, to: tokens[at - 1]!.to };
    }
    if (token.text === '[') {
      const items = list(']');
      return { kind: 'list', items, from: token.from, to: tokens[at - 1]!.to };
    }
    if (token.text === '{') {
      const fields: [string, Node][] = [];
      while (!is('}')) {
        const key = next();
        if (key.kind !== 'name' && key.kind !== 'string')
          error(`Expected a field name, found ${key.text}`, key.from, key.to);
        expect(':');
        fields.push([key.kind === 'string' ? (key.value as string) : key.text, expression()]);
        if (!eat(',')) break;
      }
      expect('}');
      return { kind: 'object', fields, from: token.from, to: tokens[at - 1]!.to };
    }
    return error(`Expected an expression, found ${token.text}`, token.from, token.to);
  }
  function postfix(): Node {
    let node = primary();
    for (;;) {
      if (eat('(')) node = { kind: 'call', callee: node, args: list(')'), from: node.from, to: tokens[at - 1]!.to };
      else if (eat('.')) {
        const member = name('a member name');
        node = { kind: 'member', of: node, name: member.text, nameFrom: member.from, from: node.from, to: member.to };
      } else if (eat('[')) {
        const index = expression();
        expect(']');
        node = { kind: 'index', of: node, index, from: node.from, to: tokens[at - 1]!.to };
      } else if (is('!')) next();
      else return node;
    }
  }
  function unary(): Node {
    if (!is('-')) return postfix();
    const minus = next();
    const operand = peek();
    // `-1` is a literal; `-(1)` and `-x` are negations.
    if (operand.kind === 'number' && operand.from === minus.to) {
      next();
      return { kind: 'literal', value: -(operand.value as number), from: minus.from, to: operand.to };
    }
    const a = unary();
    return { kind: 'neg', a, from: minus.from, to: a.to };
  }
  const binary = (ops: string[], operand: () => Node) => (): Node => {
    let a = operand();
    while (ops.includes(peek().text) && peek().kind === 'punct') {
      const op = next().text as '+' | '-' | '*' | '/';
      const b = operand();
      a = { kind: 'binary', op, a, b, from: a.from, to: b.to };
    }
    return a;
  };
  const product = binary(['*', '/'], unary);
  const expression = binary(['+', '-'], product);

  /** A type annotation: the text up to one of `stops` (outside brackets), read with `parseTypeName`. */
  const typeText = (stops: string[]) => {
    const start = peek();
    let depth = 0;
    while (peek().kind !== 'end' && (depth > 0 || !stops.includes(peek().text))) {
      if (['(', '[', '{', '<'].includes(peek().text)) depth++;
      if ([')', ']', '}', '>'].includes(peek().text)) depth--;
      next();
    }
    const raw = text.slice(start.from, tokens[at - 1]!.to);
    try {
      return typeName(parseTypeName(raw));
    } catch (failure) {
      return error((failure as Error).message, start.from, tokens[at - 1]!.to);
    }
  };

  // ---- the module ----
  const functions: { fn: Omit<Fn, 'body'>; body: Node; from: number }[] = [];
  const inputs: { name: string; type: string; value: Node; from: number; to: number }[] = [];
  const cells: { name: string; type?: string; node: Node; from: number; to: number }[] = [];
  let outputs: Token[] = [];
  let seen = false;
  while (peek().kind !== 'end') {
    if (eat('import')) {
      while (peek().kind !== 'end' && !eat(';')) next();
      continue;
    }
    const exported = eat('export');
    const start = expect('function', exported ? '"function"' : '"import", "function" or "export function"');
    const fnName = name('a function name');
    expect('(');
    if (exported) {
      if (fnName.text !== 'definition') error('The exported function is called definition', fnName.from, fnName.to);
      if (seen) error('There is one definition', fnName.from, fnName.to);
      seen = true;
      while (!is(')')) {
        const input = name('an input name');
        expect(':');
        const type = typeText(['=', ',', ')']);
        if (!is('=')) error(`Input ${input.text} needs a value: ${input.text}: ${type} = …`, input.from, input.to);
        expect('=');
        const value = expression();
        inputs.push({ name: input.text, type, value, from: input.from, to: value.to });
        if (!eat(',')) break;
      }
      expect(')');
      expect('{');
      while (eat('const')) {
        const cell = name('a cell name');
        const type = eat(':') ? typeText(['=']) : undefined;
        expect('=');
        const node = expression();
        eat(';');
        cells.push({ name: cell.text, ...(type && { type }), node, from: cell.from, to: node.to });
      }
      expect('return', '"const" or "return"');
      expect('{');
      outputs = [];
      while (!is('}')) {
        outputs.push(name('an output cell'));
        if (!eat(',')) break;
      }
      expect('}');
      eat(';');
      expect('}');
    } else {
      if (seen) error('Functions come before the definition', start.from, start.to);
      const params: Fn['params'] = [];
      while (!is(')')) {
        const param = name('a parameter name');
        expect(':', `":" and the type of ${param.text}`);
        params.push({ name: param.text, type: typeText([',', ')']) });
        if (!eat(',')) break;
      }
      expect(')');
      if (eat(':')) typeText(['{']);
      expect('{');
      expect('return', '"return": a function body is one return');
      const body = expression();
      eat(';');
      expect('}');
      functions.push({ fn: { name: fnName.text, params }, body, from: start.from });
    }
  }
  if (!seen) error('The code needs an `export function definition(…) { … }`', text.length, text.length);

  // ---- resolving: names, operations and arguments, in order ----
  const fnTypes = new Map<string, FnType>();
  const typeOf = (e: Expr, refs: ReadonlyMap<string, Type>) =>
    widen(typer([], 'cell', '').typeOf(e, { refs, fns: fnTypes }));

  function resolve(node: Node, refs: ReadonlyMap<string, Type>, fns: ReadonlyMap<string, Fn>): Expr {
    const r = (n: Node) => resolve(n, refs, fns);
    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'name':
        if (refs.has(node.name)) return { ref: node.name };
        if (node.name === 'Infinity' || node.name === 'NaN') return { number: node.name };
        if (node.name === 'undefined')
          return error('undefined stands only for a left-out argument', node.from, node.to);
        return error(`${node.name} is not defined here`, node.from, node.to);
      case 'list':
        return node.items.map((item) =>
          item.spread ? error('Spread items only in arguments', item.node.from, item.node.to) : r(item.node),
        );
      case 'object':
        return { object: Object.fromEntries(node.fields.map(([key, value]) => [key, r(value)])) };
      case 'binary':
        return { math: node.op, args: [r(node.a), r(node.b)] };
      case 'neg':
        if (node.a.kind === 'name' && node.a.name === 'Infinity' && !refs.has('Infinity'))
          return { number: '-Infinity' };
        return { math: 'neg', args: [r(node.a)] };
      case 'index': {
        if (node.index.kind !== 'literal')
          return error('An index is a whole number or a field name', node.index.from, node.index.to);
        const index = node.index.value;
        if (typeof index === 'string') return { of: r(node.of), field: index };
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0)
          return error('An index is a whole number or a field name', node.index.from, node.index.to);
        return { of: r(node.of), index };
      }
      case 'new': {
        const op =
          operationById.get(`${node.owner}.new`) ?? error(`${node.owner} cannot be made with new`, node.from, node.to);
        return { op: op.id, ...args(op.params, node.args, node, refs, fns) };
      }
      case 'member': {
        if (node.of.kind === 'name' && isClass(node.of.name) && !refs.has(node.of.name))
          return error(`${node.of.name}.${node.name} is not a value; call it`, node.from, node.to);
        const self = r(node.of);
        const owners = ownersOf(typeOf(self, refs));
        const op = owners.map((c) => operationById.get(`${c}.${node.name}`)).find((o) => o && o.value);
        if (op) return { op: op.id, self };
        const type = typeOf(self, refs);
        const fields = members(type).filter((m) => m && typeof m === 'object' && !Array.isArray(m) && node.name in m);
        if (fields.length) return { of: self, field: node.name };
        const method = owners.some((c) => operationById.has(`${c}.${node.name}`));
        return error(
          method ? `${node.name} is a method: call it` : `${typeName(type)} has no field ${node.name}`,
          node.nameFrom,
          node.to,
        );
      }
      case 'call': {
        const { callee } = node;
        if (callee.kind === 'name') {
          if (callee.name === 'value') {
            if (node.args.length !== 1) return error('value takes one JSON object', node.from, node.to);
            return { value: json(node.args[0]!.node) };
          }
          const fn = fns.get(callee.name);
          if (fn) {
            const params = fn.params.map((p) => [p.name, p.type] as [string, Slot]);
            const resolved = args(params, node.args, node, refs, fns);
            return { call: fn.name, ...resolved };
          }
          const helper = operationById.get(`helpers.${callee.name}`);
          if (helper) return { op: helper.id, ...args(helper.params, node.args, node, refs, fns) };
          return error(`${callee.name} is not a function defined before here`, callee.from, callee.to);
        }
        if (callee.kind !== 'member') return error('Only functions and methods can be called', callee.from, callee.to);
        if (callee.of.kind === 'name' && isClass(callee.of.name) && !refs.has(callee.of.name)) {
          const id = `${callee.of.name}.${callee.name}`;
          const op = operationById.get(id);
          if (!op || !op.static || op.value)
            return error(`${id} is not a static method of vec2`, callee.nameFrom, callee.to);
          return { op: id, ...args(op.params, node.args, node, refs, fns) };
        }
        const self = r(callee.of);
        const type = typeOf(self, refs);
        const op = ownersOf(type)
          .map((c) => operationById.get(`${c}.${callee.name}`))
          .find((o) => o && !o.static && !o.value);
        if (!op) return error(`${typeName(type)} has no method ${callee.name}`, callee.nameFrom, callee.to);
        return { op: op.id, self, ...args(op.params, node.args, node, refs, fns) };
      }
    }
  }
  /** The classes a value of `type` can be, for finding its members. */
  const ownersOf = (type: Type) => members(type).filter((m): m is string => typeof m === 'string' && isClass(m));
  /** Positional arguments → named: `undefined` leaves one out, a rest parameter takes the remaining ones. */
  function args(
    params: readonly [string, Slot][],
    given: Arg[],
    node: Node,
    refs: ReadonlyMap<string, Type>,
    fns: ReadonlyMap<string, Fn>,
  ): { args?: Record<string, Expr> } {
    const out: Record<string, Expr> = {};
    let i = 0;
    for (const [param, slot] of params) {
      if (isRest(slot)) {
        const rest = given.slice(i);
        i = given.length;
        if (rest.length === 1 && rest[0]!.spread) out[param] = resolve(rest[0]!.node, refs, fns);
        else if (rest.length)
          out[param] = rest.map((a) =>
            a.spread ? error('Spread only a single rest argument', a.node.from, a.node.to) : resolve(a.node, refs, fns),
          );
        continue;
      }
      const arg = given[i++];
      if (!arg) continue;
      if (arg.spread) error('Spread only a rest argument', arg.node.from, arg.node.to);
      if (arg.node.kind === 'name' && arg.node.name === 'undefined' && !refs.has('undefined')) {
        if (!isOptional(slot)) error(`${param} cannot be left out`, arg.node.from, arg.node.to);
        continue;
      }
      out[param] = resolve(arg.node, refs, fns);
    }
    if (i < given.length) error(`Too many arguments (${params.length} expected)`, given[i]!.node.from, node.to);
    return Object.keys(out).length ? { args: out } : {};
  }
  /** A stored value: plain JSON written as a literal. */
  function json(node: Node): unknown {
    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'list':
        return node.items.map((item) => json(item.node));
      case 'object':
        return Object.fromEntries(node.fields.map(([k, v]) => [k, json(v)]));
      case 'neg':
        if (node.a.kind === 'literal' && typeof node.a.value === 'number') return -node.a.value;
    }
    return error('A stored value is plain JSON', node.from, node.to);
  }

  const fnMap = new Map<string, Fn>();
  const outFunctions: Fn[] = [];
  for (const { fn, body } of functions) {
    const params = new Map(fn.params.map((p) => [p.name, parseTypeName(p.type)]));
    const resolved = { ...fn, body: resolve(body, params, fnMap) };
    fnTypes.set(fn.name, {
      params: fn.params.map((p) => ({ name: p.name, type: parseTypeName(p.type) })),
      returns: typeOf(resolved.body, params),
    });
    fnMap.set(fn.name, resolved);
    outFunctions.push(resolved);
  }
  const refs = new Map<string, Type>();
  const outInputs: Input[] = inputs.map((input) => {
    const value = resolve(input.value, new Map(), new Map());
    refs.set(input.name, input.type);
    return { name: input.name, type: input.type, value };
  });
  const outCells: Cell[] = cells.map((cell) => {
    if (refs.has(cell.name)) error(`${cell.name} is already defined`, cell.from, cell.from + cell.name.length);
    const expr = resolve(cell.node, refs, fnMap);
    refs.set(cell.name, cell.type ? parseTypeName(cell.type) : typeOf(expr, refs));
    return { name: cell.name, expr, ...(cell.type && { type: cell.type }) };
  });
  for (const output of outputs) {
    const cell = outCells.find((c) => c.name === output.text);
    if (!cell) error(`${output.text} is not a cell; only cells are outputs`, output.from, output.to);
    cell!.output = true;
  }
  return { format: 'vec2-definition', version: 4, inputs: outInputs, functions: outFunctions, cells: outCells };
}
