/**
 * A definition as a TypeScript module: user functions, then `definition(inputs)` with one `const` per cell, returning
 * the output cells. The code runs as it is against vec2, and `parseDefinition` reads it back to the same definition.
 */
import type { Definition, Expr, Fn } from '@dirty-geometry/vec2/recording/definition';
import { walk } from '@dirty-geometry/vec2/recording/expr';
import { isRest, NUMBER_TYPES, operationById } from '@dirty-geometry/vec2/schema/schema';

export const BINDINGS = '@dirty-geometry/vec2/schema/bindings';
const WIDTH = 100;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const key = (name: string) => (IDENTIFIER.test(name) ? name : quote(name));
export const formatNumber = (n: number) => (Object.is(n, -0) ? '-0' : String(n));

/** Binding strength: arithmetic below calls and names. */
const SUM = 1;
const PRODUCT = 2;
const UNARY = 3;
const POSTFIX = 4;

/** A printed expression: its flat text, how it breaks over lines, and how strongly it binds. */
type Doc = { flat: string; lines: (indent: string) => string; prec: number };
const leaf = (text: string, prec = POSTFIX): Doc => ({ flat: text, lines: () => text, prec });
/** `open item, item close`, one item per line when it does not fit. */
const group = (open: string, items: Doc[], close: string, prec = POSTFIX): Doc => {
  const flat = `${open}${items.map((d) => d.flat).join(', ')}${close}`;
  return {
    flat,
    prec,
    lines: (indent) => {
      if (indent.length + flat.length <= WIDTH || items.length === 0) return flat;
      // A single list or object hugs the brackets around it: `new Polygon2([` … `])`.
      if (items.length === 1 && /^[[{]/.test(items[0]!.flat)) return `${open}${items[0]!.lines(indent)}${close}`;
      const inner = `${indent}  `;
      const lines = items.map((d) => `${inner}${fit(d, inner)},`).join('\n');
      return `${open.trimEnd()}\n${lines}\n${indent}${close.trimStart()}`;
    },
  };
};
const fit = (doc: Doc, indent: string) => (indent.length + doc.flat.length <= WIDTH ? doc.flat : doc.lines(indent));
/** `head` + a group: `new Vec2(` … `)`. */
const prefixed = (head: string, doc: Doc): Doc => ({
  flat: head + doc.flat,
  prec: POSTFIX,
  lines: (indent) => head + doc.lines(indent),
});
const join = (left: Doc, op: string, right: Doc, prec: number): Doc => ({
  flat: `${left.flat} ${op} ${right.flat}`,
  prec,
  lines: (indent) => `${fit(left, indent)} ${op} ${fit(right, indent)}`,
});
const paren = (doc: Doc): Doc => ({ flat: `(${doc.flat})`, prec: POSTFIX, lines: (i) => `(${doc.lines(i)})` });
const atLeast = (doc: Doc, prec: number) => (doc.prec < prec ? paren(doc) : doc);
const postfix = (doc: Doc, tail: string): Doc => {
  const inner = atLeast(doc, POSTFIX);
  return { flat: inner.flat + tail, prec: POSTFIX, lines: (i) => inner.lines(i) + tail };
};

/** A stored value's JSON as an object literal. */
function json(value: unknown): Doc {
  if (value === null || typeof value !== 'object')
    return leaf(
      typeof value === 'string' ? quote(value) : typeof value === 'number' ? formatNumber(value) : String(value),
    );
  if (Array.isArray(value)) return group('[', value.map(json), ']');
  return group(
    '{ ',
    Object.entries(value).map(([k, v]) => prefixed(`${key(k)}: `, json(v))),
    ' }',
  );
}

/** Positional arguments in parameter order; a missing argument before a given one is `undefined`. */
function positional(params: { name: string; rest?: boolean }[], args: Record<string, Expr> = {}, fns: Fns): Doc[] {
  const docs: Doc[] = [];
  let pending = 0;
  for (const { name, rest } of params) {
    const arg = args[name];
    if (arg === undefined) {
      pending++;
      continue;
    }
    for (; pending > 0; pending--) docs.push(leaf('undefined'));
    if (rest && Array.isArray(arg)) docs.push(...arg.map((item) => expr(item, fns)));
    else if (rest) docs.push(prefixed('...', atLeast(expr(arg, fns), UNARY)));
    else docs.push(expr(arg, fns));
  }
  return docs;
}
type Fns = ReadonlyMap<string, Fn>;

export function expr(e: Expr, fns: Fns = new Map()): Doc {
  if (e === null || typeof e === 'boolean') return leaf(String(e));
  if (typeof e === 'number') return leaf(formatNumber(e), e < 0 || Object.is(e, -0) ? UNARY : POSTFIX);
  if (typeof e === 'string') return leaf(quote(e));
  if (Array.isArray(e))
    return group(
      '[',
      e.map((item) => expr(item, fns)),
      ']',
    );
  if ('number' in e) return leaf(e.number, e.number === '-Infinity' ? UNARY : POSTFIX);
  if ('value' in e) return prefixed('value', group('(', [json(e.value)], ')'));
  if ('object' in e)
    return group(
      '{ ',
      Object.entries(e.object).map(([k, v]) => prefixed(`${key(k)}: `, expr(v, fns))),
      ' }',
    );
  if ('ref' in e) return leaf(e.ref);
  if ('call' in e) {
    const params = fns.get(e.call)?.params ?? Object.keys(e.args ?? {}).map((name) => ({ name }));
    return prefixed(e.call, group('(', positional(params, e.args, fns), ')'));
  }
  if ('math' in e) {
    if (e.math === 'neg') {
      const operand = expr(e.args[0], fns);
      // `-(-x)` and `-(1)`: a bare minus would merge with the operand (`--x`, the literal `-1`).
      const inner = operand.prec < UNARY || /^-|^[\d.]/.test(operand.flat) ? paren(operand) : operand;
      return { flat: `-${inner.flat}`, prec: UNARY, lines: (i) => `-${inner.lines(i)}` };
    }
    const prec = e.math === '+' || e.math === '-' ? SUM : PRODUCT;
    const [a, b] = e.args.map((arg) => expr(arg, fns)) as [Doc, Doc];
    // Left-associative: the right operand is bracketed at the same strength, so the tree reads back as written.
    return join(atLeast(a, prec), e.math, b.prec <= prec ? paren(b) : b, prec);
  }
  if ('of' in e) {
    if ('index' in e) return postfix(expr(e.of, fns), `[${e.index}]`);
    return postfix(expr(e.of, fns), IDENTIFIER.test(e.field) ? `.${e.field}` : `[${quote(e.field)}]`);
  }
  const op = operationById.get(e.op);
  const [owner, member] = e.op.split('.') as [string, string];
  const params = (op?.params ?? Object.keys(e.args ?? {}).map((name) => [name, 'unknown'] as const)).map(
    ([name, slot]) => ({ name, rest: isRest(slot) }),
  );
  const args = group('(', positional(params, e.args, fns), ')');
  if (owner === 'helpers') return prefixed(member, args);
  if (member === 'new' && !e.self) return prefixed(`new ${owner}`, args);
  if (e.self === undefined) return prefixed(`${owner}.${member}`, args);
  const self = expr(e.self, fns);
  if (op?.value) return postfix(self, `.${member}`);
  const head = atLeast(self, POSTFIX);
  return {
    flat: `${head.flat}.${member}${args.flat}`,
    prec: POSTFIX,
    lines: (i) => `${head.lines(i)}.${member}${args.lines(i)}`,
  };
}

/** The names a definition uses from vec2: classes and helpers (values), number types (types). */
function imports(definition: Definition) {
  const values = new Set<string>();
  const typeNames = new Set<string>();
  const visit = (e: Expr): void => {
    for (const { expr: x } of walk(e)) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
      if ('value' in x) values.add('value');
      if (!('op' in x)) continue;
      const [owner, member] = x.op.split('.') as [string, string];
      if (owner === 'helpers') values.add(member);
      else if (operationById.get(x.op)?.static !== false) values.add(owner);
    }
  };
  const annotate = (type: string) => {
    for (const word of type.match(/[A-Za-z_$][\w$]*/g) ?? [])
      if (NUMBER_TYPES.includes(word)) typeNames.add(word);
      else if (/^[A-Z]/.test(word) && word !== 'Record') values.add(word);
  };
  definition.inputs.forEach((input) => (annotate(input.type), visit(input.value)));
  definition.functions.forEach((fn) => (fn.params.forEach((p) => annotate(p.type)), visit(fn.body)));
  definition.cells.forEach((cell) => (cell.type && annotate(cell.type), visit(cell.expr)));
  return { values: [...values].sort(), types: [...typeNames].sort() };
}

export function printDefinition(definition: Definition): string {
  const fns = new Map(definition.functions.map((fn) => [fn.name, fn]));
  const { values, types } = imports(definition);
  const out: string[] = [
    '// A vec2 definition: inputs are the parameters of `definition`, each const is a cell, and the returned cells are',
    '// its outputs. Edit it and apply with Ctrl+Enter.',
  ];
  const names = (list: string[]) =>
    fit(
      group(
        '{ ',
        list.map((name) => leaf(name)),
        ' }',
      ),
      '',
    );
  if (values.length) out.push(`import ${names(values)} from '${BINDINGS}';`);
  if (types.length) out.push(`import type ${names(types)} from '${BINDINGS}';`);
  for (const fn of definition.functions) {
    const params = fn.params.map((p) => `${p.name}: ${p.type}`).join(', ');
    out.push('', `function ${fn.name}(${params}) {`, `  return ${fit(expr(fn.body, fns), '  ')};`, '}');
  }
  const inputs = definition.inputs.map((input) => `${input.name}: ${input.type} = ${expr(input.value, fns).flat}`);
  const head = `export function definition(${inputs.join(', ')}) {`;
  out.push(
    '',
    head.length <= WIDTH ? head : `export function definition(\n${inputs.map((i) => `  ${i},`).join('\n')}\n) {`,
  );
  for (const cell of definition.cells) {
    const start = `  const ${cell.name}${cell.type ? `: ${cell.type}` : ''} = `;
    out.push(`${start}${fit(expr(cell.expr, fns), '  ')};`);
  }
  const outputs = definition.cells.filter((cell) => cell.output).map((cell) => cell.name);
  out.push(outputs.length ? `  return { ${outputs.join(', ')} };` : '  return {};', '}', '');
  return out.join('\n');
}
