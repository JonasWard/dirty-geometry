/**
 * vec2.dense.json: vec2.schema.json as a densing (0.5) schema for version 4 definitions. Expressions are typed: what may
 * stand where a value of some type is expected is a union of its own. A union's variants are object templates (by
 * index), so unions that offer the same alternatives (an operation, `input`, …) share one template.
 *
 * - `definitions`: one per number type, its range names expanded (`±100@0.01` → `{ min: -100, max: 100, precision: 0.01 }`).
 * - `templates`:
 *   - `MathJson` and the JSON types it uses (the stored vec2 values), then `Any` and `Text`;
 *   - one **expression union per type**, named like the TypeScript type (`Vec2`, `Coordinate`, `Vec2[]`,
 *     `Aabb2 | Vec2`): a reference (`input`, `cell`, `param`), a function call (`fn`), an item or field of another
 *     value (`index`, `field`), a stored value (`value`), arithmetic (`math`, `neg`, numbers only), the literal shapes
 *     the type allows, and every operation whose result fits, keyed by its id (`Vec2.add`);
 *   - one **object template per operation signature**, named by its index (`"77"`): `self` (instance members), then
 *     one field per parameter, typed by that parameter's expression union;
 *   - `Any`: an expression of any type, keyed by the type's name (cell roots, function bodies, `of`, function args).
 * - `fields`: stamp, inputs, functions and cells. Every union's discriminator is `type`.
 */
import { typeName, typeSystem, type Type } from '../packages/vec2/schema/typing';
import { SKIP_MEMBERS } from '../packages/vec2/schema/policy';

type Field = Record<string, any>;
type Schema = {
  numbers: Record<string, any>;
  types: Record<string, any>;
  modules: Record<string, any>;
};
const isKind = (type: unknown, kind: string): type is Record<string, any> =>
  !!type && typeof type === 'object' && !Array.isArray(type) && Object.keys(type).length === 1 && kind in type;
const flagged = (slot: any) => !!slot && typeof slot === 'object' && ('optional' in slot || 'rest' in slot);
const slotType = (slot: any) => (flagged(slot) ? slot.type : slot);
const enumeration = (name: string, options: unknown[]) => ({
  type: 'enum',
  name,
  options: [...options.map(String), ''].slice(0, Math.max(2, options.length)),
});
/** `variants`: variant name → index of its object template. */
const union = (name: string, variants: Record<string, number>) => ({
  type: 'union',
  name,
  discriminator: 'type',
  variants,
});
const array = (name: string, items: Field, max = 65535, min = 0) => ({
  type: 'array',
  name,
  minLength: min,
  maxLength: max,
  items,
});
const int = (name: string, max: number) => ({ type: 'int', name, min: 0, max });
const CHARS = enumeration(
  'char',
  [...Array(95)].map((_, i) => String.fromCharCode(32 + i)),
);
const TEXT = {
  type: 'enum_array',
  name: 'Text',
  enum: CHARS,
  minLength: 0,
  maxLength: 255,
};
/** Limits of a definition. */
export const LIMITS = {
  inputs: 255,
  cells: 1023,
  functions: 63,
  params: 15,
  args: 255,
  items: 65535,
} as const;

/** `±100@0.01`, `0..255`: a range name is its own definition. */
function range(name: string) {
  const m = /^(?:±([\d.]+)|(-?[\d.]+)\.\.(-?[\d.]+))(?:@([\d.]+))?$/.exec(name);
  if (!m) throw new Error(`Range ${name} is not ±max@precision or min..max@precision`);
  const [min, max] = m[1] ? [-Number(m[1]), Number(m[1])] : [Number(m[2]), Number(m[3])];
  return { min, max, ...(m[4] ? { precision: Number(m[4]) } : {}) };
}
const rangeName = ({ min, max, precision }: { min: number; max: number; precision?: number }) =>
  `${min === -max ? `±${max}` : `${min}..${max}`}${precision ? `@${precision}` : ''}`;

export function renderDenseSchema({ numbers, types, modules }: Schema): string {
  const ranges = (type: string): string[] => {
    const spec = numbers[type];
    if (Array.isArray(spec)) return spec;
    const clamp = (r: ReturnType<typeof range>) => ({
      ...r,
      min: Math.max(r.min, spec.min ?? -Infinity),
      max: Math.min(r.max, spec.max ?? Infinity),
    });
    return [...new Set([...ranges(spec.extends).map((name) => rangeName(clamp(range(name)))), ...(spec.ranges ?? [])])];
  };
  const definitions = Object.keys(numbers).map((name) => ({
    name,
    presets: Object.fromEntries(ranges(name).map((r) => [r, range(r)])),
  }));

  // The operations, read from the schema's folders and classes.
  type Op = {
    id: string;
    owner: string;
    isStatic: boolean;
    params: [string, any][];
    returns: Type;
  };
  const ops: Op[] = [];
  const classNames: string[] = [];
  const valueClasses: string[] = [];
  (function walk(node: any, path: string[]) {
    const name = path.at(-1)!;
    if (node === null) return;
    if ('returns' in node)
      return ops.push({
        id: `helpers.${name}`,
        owner: 'helpers',
        isStatic: true,
        params: Object.entries(node.params ?? {}),
        returns: node.returns,
      });
    if (!('members' in node)) return Object.entries(node).forEach(([key, child]) => walk(child, [...path, key]));
    classNames.push(name);
    if (node.members.toJson) valueClasses.push(name);
    if (node.new)
      ops.push({
        id: `${name}.new`,
        owner: name,
        isStatic: true,
        params: Object.entries(node.new),
        returns: name,
      });
    for (const [member, entry] of Object.entries<any>(node.members)) {
      if (!entry || SKIP_MEMBERS.has(member)) continue;
      const params = Object.entries<any>(entry.params ?? {});
      if (params.some(([p]) => p === 'type'))
        throw new Error(`${name}.${member}: a parameter named \`type\` would clash`);
      ops.push({
        id: `${name}.${member}`,
        owner: name,
        isStatic: entry.static === true,
        params,
        returns: 'value' in entry ? entry.value : entry.returns,
      });
    }
  })(modules, []);
  const { members, assignable, isNumeric, collapse, groupKey } = typeSystem({
    types,
    classes: classNames,
    numbers: Object.keys(numbers),
  });
  const isValueClass = (t: Type) => typeof t === 'string' && valueClasses.includes(t);

  const templates: Field[] = [];
  const index = new Map<string, number>();
  const reserve = (key: string) => {
    if (!index.has(key)) index.set(key, templates.push({}) - 1);
    return index.get(key)!;
  };
  const ref = (name: string, key: string, build: () => Field) => {
    if (!index.has(key)) {
      reserve(key); // reserved first: a template may refer to itself
      templates[index.get(key)!] = build();
    }
    return { type: 'reference', name, ref: index.get(key) };
  };
  /** A union variant: an object template, shared by every variant with the same fields. `name` may be built from the
   * template's index. */
  const shared = new Map<string, number>();
  const variant = (name: string | ((index: number) => string), fields: Field[]): number => {
    const key = JSON.stringify(fields);
    if (!shared.has(key)) {
      const at = templates.length;
      templates.push({ type: 'object', name: typeof name === 'string' ? name : name(at), fields });
      shared.set(key, at);
    }
    return shared.get(key)!;
  };
  const variants = (type: Type, list: Record<string, Field[]>) =>
    Object.fromEntries(Object.entries(list).map(([key, fields]) => [key, variant(`${typeName(type)} ${key}`, fields)]));
  const text = (name: string) => ref(name, 'Text', () => TEXT);
  const entries = (value: Field) =>
    array('entries', { type: 'object', name: 'entry', fields: [text('name'), value] }, 255);
  const number = (name: string, type: unknown): Field | undefined => {
    if (typeof type === 'string' && type in numbers) return { type: 'reference_numeric', name, ref: type };
    if (type === 'number') return { type: 'reference_numeric', name, ref: 'Coordinate' };
    const values = isKind(type, 'enum') ? type.enum.filter((v: unknown) => typeof v === 'number') : [];
    return values.length
      ? {
          type: 'fixed',
          name,
          min: Math.min(...values),
          max: Math.max(...values),
          precision: Math.min(...values),
        }
      : undefined;
  };
  const items = (type: any) =>
    Array.isArray(type) ? type[0] : new Set(type.tuple.map(String)).size > 1 ? { or: type.tuple } : type.tuple[0];

  // ---- the stored values: MathJson and the JSON types ----
  function json(name: string, type: any): Field {
    const n = number(name, type);
    if (n) return n;
    if (type === 'boolean') return { type: 'bool', name };
    if (type === 'string') return text(name);
    if (type === 'MathJson') return mathJson(name);
    if (typeof type === 'string' && type.endsWith('Json')) return ref(name, type, () => object(type, types[type]));
    if (typeof type === 'string' && type in types) return json(name, types[type]);
    if (Array.isArray(type) || isKind(type, 'tuple')) return array(name, json('item', items(type)));
    if (isKind(type, 'enum')) return enumeration(name, type.enum);
    if (isKind(type, 'record')) return { ...entries(json('value', type.record)), name };
    if (type && typeof type === 'object') return object(name, type);
    throw new Error(`No dense layout for ${JSON.stringify(type)}`);
  }
  const object = (name: string, fields: Record<string, any>): Field => ({
    type: 'object',
    name,
    fields: Object.entries(fields).map(([key, slot]) =>
      slot?.optional ? { type: 'optional', name: key, field: json(key, slot.type) } : json(key, slot),
    ),
  });
  const mathJson = (name: string) =>
    ref(name, 'MathJson', () => {
      const tags: string[] = types.MathJson.or;
      return union(
        'MathJson',
        Object.fromEntries(tags.map((m) => [m.replace(/Json$/, ''), ref('value', m, () => object(m, types[m])).ref!])),
      );
    });
  mathJson('value');
  const ANY = reserve('Any');
  const any = (name: string) => ({ type: 'reference', name, ref: ANY });
  text('name');

  // ---- expressions ----
  const groups = new Map<string, { type: Type; ops: Op[] }>();
  for (const op of ops) {
    const key = groupKey(op.returns);
    if (!groups.has(key)) groups.set(key, { type: collapse(op.returns), ops: [] });
    groups.get(key)!.ops.push(op);
  }

  const nonFinite = () => [enumeration('value', ['Infinity', '-Infinity', 'NaN'])];
  /** The literal shapes a value of `type` can be written as. */
  function shapes(type: any): Record<string, Field[]> {
    const n = number('value', type);
    if (n) return { number: [n] };
    if (type === 'boolean') return { boolean: [{ type: 'bool', name: 'value' }] };
    if (type === 'string') return { string: [text('value')] };
    if (type === 'null') return { null: [] };
    if (typeof type === 'string') return type in types && !type.endsWith('Json') ? shapes(types[type]) : {};
    if (Array.isArray(type) || isKind(type, 'tuple'))
      return {
        list: [array('items', expr('item', items(type)), LIMITS.items)],
      };
    if (isKind(type, 'enum')) {
      const strings = type.enum.filter((v: unknown) => typeof v === 'string');
      const bools = type.enum.filter((v: unknown) => typeof v === 'boolean');
      return {
        ...(type.enum.some((v: unknown) => typeof v === 'number') && {
          number: [number('value', type)!],
        }),
        ...(strings.length && { string: [enumeration('value', strings)] }),
        ...(bools.length && { boolean: [{ type: 'bool', name: 'value' }] }),
        ...(type.enum.includes(null) && { null: [] }),
      };
    }
    if (isKind(type, 'record')) return { record: [entries(expr('value', type.record))] };
    if (isKind(type, 'or')) {
      const merged: Record<string, Field[]> = Object.assign({}, ...[...type.or].reverse().map(shapes));
      const lists = type.or
        .map((m: any) => (typeof m === 'string' && m in types ? types[m] : m))
        .filter((m: any) => Array.isArray(m) || isKind(m, 'tuple'));
      return lists.length > 1 ? { ...merged, ...shapes([{ or: lists.map(items) }]) } : merged;
    }
    const fields = Object.entries<any>(type).map(([key, slot]) =>
      flagged(slot) ? { type: 'optional', name: key, field: expr(key, slotType(slot)) } : expr(key, slot),
    );
    return { object: [{ type: 'object', name: 'fields', fields }] };
  }
  /** The names of the expression unions. */
  const exprs = new Set<string>();
  /** What may stand where a value of `type` is expected. */
  const expr = (name: string, type: Type): Field =>
    ref(name, typeName(type), () => {
      const numeric = members(type).some(isNumeric);
      const self = () => expr('a', type);
      const fitting = [...groups.values()].filter((g) => assignable(g.type, type)).flatMap((g) => g.ops);
      exprs.add(typeName(type));
      return union(typeName(type), {
        input: variant('input', [int('input', LIMITS.inputs)]),
        cell: variant('cell', [int('cell', LIMITS.cells)]),
        param: variant('param', [int('param', LIMITS.params)]),
        fn: variant('fn', [int('fn', LIMITS.functions), array('args', any('arg'), LIMITS.params)]),
        index: variant('index', [any('of'), int('at', LIMITS.items)]),
        field: variant('field', [any('of'), text('at')]),
        ...(members(type).some(isValueClass) && { value: variant('value', [mathJson('value')]) }),
        ...(numeric && {
          nonFinite: variant('nonFinite', nonFinite()),
          ...variants(type, {
            math: [enumeration('op', ['+', '-', '*', '/']), self(), expr('b', type)],
            neg: [self()],
          }),
        }),
        ...variants(type, shapes(type)),
        ...Object.fromEntries(fitting.map((op) => [op.id, call(op)])),
      });
    });
  /** An operation's arguments: `self` (instance members), then its params; named by its index. */
  const call = (op: Op): number => {
    const slots: [string, any][] = [...(op.isStatic ? [] : [['self', op.owner] as [string, any]]), ...op.params];
    const fields = slots.map(([param, slot]) =>
      slot?.rest
        ? array(param, expr('item', slot.type), LIMITS.args)
        : slot?.optional
          ? { type: 'optional', name: param, field: expr(param, slot.type) }
          : expr(param, slot),
    );
    return variant(String, fields);
  };

  // Every type an expression may have at a root: results, parameters, inputs, and lists of values.
  const roots: Type[] = [
    ...['number', 'boolean', 'string', ...Object.keys(numbers)].flatMap((t) => [t, [t]]),
    ...valueClasses,
    ...valueClasses.map((c) => [c]),
    ...ops.flatMap((op) => [
      op.returns,
      ...(op.isStatic ? [] : [op.owner]),
      ...op.params.map(([, slot]) => slotType(slot)),
    ]),
  ];
  for (const type of roots) expr('value', type);
  const exprNames = [...index.keys()].filter((key) => exprs.has(key));
  templates[ANY] = union(
    'Any',
    Object.fromEntries(
      exprNames.map((key) => [key, variant(`Any ${key}`, [{ type: 'reference', name: 'value', ref: index.get(key) }])]),
    ),
  );

  const named = (name: string, max: number, ...fields: Field[]) =>
    array(`${name}s`, { type: 'object', name, fields: [text('name'), ...fields] }, max);
  const fields = [
    { type: 'int', name: 'stamp', min: 0, max: 0xffffffff },
    named('input', LIMITS.inputs, any('value')),
    named(
      'function',
      LIMITS.functions,
      array(
        'params',
        {
          type: 'object',
          name: 'param',
          fields: [text('name'), enumeration('type', exprNames)],
        },
        LIMITS.params,
      ),
      any('body'),
    ),
    named('cell', LIMITS.cells, { type: 'bool', name: 'output' }, { type: 'bool', name: 'typed' }, any('expr')),
  ];

  return [
    '{',
    `  "definitions": [\n${definitions.map((d) => `    ${JSON.stringify(d)}`).join(',\n')}\n  ],`,
    `  "templates": [\n${templates.map((t) => `    ${JSON.stringify(t)}`).join(',\n')}\n  ],`,
    `  "fields": [\n${fields.map((f) => `    ${JSON.stringify(f)}`).join(',\n')}\n  ]`,
    '}',
    '',
  ].join('\n');
}
