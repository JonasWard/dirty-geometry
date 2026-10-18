/**
 * vec2.dense.json: vec2.schema.json as a densing schema, loaded at runtime with densing's `schemaFromJson`.
 *
 * - `definitions`: one per number type, its range names expanded (`±100@0.01` → `{ min: -100, max: 100, precision: 0.01 }`).
 * - `templates`: `MathJson` (a union keyed by `type`, first, so the value templates come first), the JSON types other
 *   JSON types use, `Source` (node | param), `Text`, `ParamValue`, and one `Arg<T>` per parameter type: a union keyed by
 *   the argument's JS shape (node, param, omit, value, nonFinite, and the literal shapes `T` allows).
 * - `fields`: stamp, params, outputs and nodes. Nodes are nested unions keyed `$op` that follow the schema's folders,
 *   files and classes down to the member (`#member` for instance members); a level with one entry joins its child
 *   (`vec2/Vec2`), so it costs no bits.
 */
import { SKIP_MEMBERS } from '../packages/vec2/schema/policy';

type Field = Record<string, any>;
type Schema = { numbers: Record<string, any>; types: Record<string, any>; modules: Record<string, any> };
const isKind = (type: unknown, kind: string): type is Record<string, any> =>
  !!type && typeof type === 'object' && !Array.isArray(type) && Object.keys(type).length === 1 && kind in type;
const slotType = (slot: any) =>
  slot && typeof slot === 'object' && ('optional' in slot || 'rest' in slot) ? slot.type : slot;
const enumeration = (name: string, options: unknown[]) => ({
  type: 'enum',
  name,
  options: [...options.map(String), ''].slice(0, Math.max(2, options.length)),
});
const union = (name: string, key: string, variants: Record<string, Field[]>) => ({
  type: 'union',
  name,
  discriminator: enumeration(key, Object.keys(variants)),
  variants,
});
const array = (name: string, items: Field, max = 65535, min = 0) => ({
  type: 'array',
  name,
  minLength: min,
  maxLength: max,
  items,
});
const int = (name: string, max = 4095) => ({ type: 'int', name, min: 0, max });
const CHARS = enumeration(
  'char',
  [...Array(95)].map((_, i) => String.fromCharCode(32 + i)),
);
const TEXT = { type: 'enum_array', name: 'Text', enum: CHARS, minLength: 0, maxLength: 255 };

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

  const templates: Field[] = [];
  const index = new Map<string, number>();
  const ref = (name: string, key: string, build: () => Field) => {
    if (!index.has(key)) {
      index.set(key, templates.push({}) - 1); // reserved first: a template may refer to itself
      templates[index.get(key)!] = build();
    }
    return { type: 'reference', name, ref: index.get(key) };
  };
  const text = (name: string) => ref(name, 'Text', () => TEXT);
  const entries = (value: Field) =>
    array('entries', { type: 'object', name: 'entry', fields: [text('name'), value] }, 255);
  const number = (name: string, type: unknown): Field | undefined => {
    if (typeof type === 'string' && type in numbers) return { type: 'reference_numeric', name, ref: type };
    const values = isKind(type, 'enum') ? type.enum.filter((v: unknown) => typeof v === 'number') : [];
    return values.length
      ? { type: 'fixed', name, min: Math.min(...values), max: Math.max(...values), precision: Math.min(...values) }
      : undefined;
  };
  const items = (type: any) =>
    Array.isArray(type) ? type[0] : new Set(type.tuple.map(String)).size > 1 ? { or: type.tuple } : type.tuple[0];

  /** A JSON type → its densing field; JSON types are templates, so they refer to each other. */
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
  /** Any vec2 value: the members of `MathJson`, keyed by their tag (the type name without `Json`). */
  const mathJson = (name: string) =>
    ref(name, 'MathJson', () => {
      const members: string[] = types.MathJson.or;
      return union(
        'MathJson',
        'type',
        Object.fromEntries(members.map((m) => [m.replace(/Json$/, ''), object(m, types[m]).fields])),
      );
    });
  mathJson('value');

  const source = (name: string) =>
    ref(name, 'Source', () => union('Source', 'kind', { node: [int('node')], param: [int('param')] }));
  /** The literal shapes an argument of `type` can take (vec2 values come as `value` or a node). */
  function shapes(type: any): Record<string, Field[]> {
    const n = number('value', type);
    if (n) return { number: [n] };
    if (type === 'boolean') return { boolean: [{ type: 'bool', name: 'value' }] };
    if (type === 'string') return { string: [text('value')] };
    if (type === 'null') return { null: [] };
    if (typeof type === 'string') return type in types && !type.endsWith('Json') ? shapes(types[type]) : {};
    if (Array.isArray(type) || isKind(type, 'tuple'))
      return { list: [array('items', arg('item', items(type)), 65535)] };
    if (isKind(type, 'enum')) {
      const strings = type.enum.filter((v: unknown) => typeof v === 'string');
      return {
        ...(strings.length && { string: [enumeration('value', strings)] }),
        ...(type.enum.includes(null) && { null: [] }),
      };
    }
    if (isKind(type, 'record')) return { record: [entries(arg('value', type.record))] };
    if (isKind(type, 'or')) {
      const merged: Record<string, Field[]> = Object.assign({}, ...[...type.or].reverse().map(shapes));
      const lists = type.or
        .map((m: any) => (typeof m === 'string' && m in types ? types[m] : m))
        .filter((m: any) => Array.isArray(m) || isKind(m, 'tuple'));
      return lists.length > 1 ? { ...merged, ...shapes([{ or: lists.map(items) }]) } : merged;
    }
    const fields = Object.entries(type).map(([key, slot]) => arg(key, slotType(slot)));
    return { object: [{ type: 'object', name: 'fields', fields }] };
  }
  /** An argument of `type`: a node, a param, omitted, a vec2 value, or one of the type's literal shapes. */
  const arg = (name: string, type: unknown): Field =>
    ref(name, `Arg<${typeof type === 'string' ? type : JSON.stringify(type)}>`, () => {
      const nonFinite = [enumeration('value', ['Infinity', '-Infinity', 'NaN'])];
      const variants = {
        node: [int('node')],
        param: [int('param')],
        omit: [],
        value: [mathJson('value')],
        nonFinite,
        ...shapes(type),
      };
      return union(`Arg<${typeof type === 'string' ? type : JSON.stringify(type)}>`, 'kind', variants);
    });

  // Nodes: the schema's folders → files → classes → members, with `result` for elements and fields of results.
  const tree: Record<string, any> = {
    result: { item: { $leaf: [source('of'), int('at', 65535)] }, field: { $leaf: [source('of'), text('at')] } },
  };
  const leaf = (path: string[], fields: Field[]) => {
    let node = tree;
    for (const key of path.slice(0, -1)) node = node[key] ??= {};
    node[path.at(-1)!] = { $leaf: fields };
  };
  const signature = (entry: any, self: boolean) => [
    ...(self ? [source('self')] : []),
    ...Object.entries(entry.params ?? {}).map(([name, slot]: [string, any]) =>
      slot?.rest ? array(name, arg('item', slot.type), 255) : arg(name, slotType(slot)),
    ),
  ];
  (function walk(node: any, path: string[]) {
    if (node === null) return;
    if ('returns' in node) return leaf(path, signature(node, false));
    if (!('members' in node)) return Object.entries(node).forEach(([key, child]) => walk(child, [...path, key]));
    if (node.new) leaf([...path, 'new'], signature({ params: node.new }, false));
    for (const [key, entry] of Object.entries<any>(node.members)) {
      if (!entry || SKIP_MEMBERS.has(key)) continue;
      leaf([...path, entry.static === true ? key : `#${key}`], signature(entry, entry.static !== true));
      if (typeof entry.static === 'object') leaf([...path, key], signature(entry.static, false));
    }
  })(modules, []);
  const nodeUnion = (node: Record<string, any>, name: string): Field => {
    const variants: Record<string, Field[]> = {};
    for (let [key, child] of Object.entries(node)) {
      while (!child.$leaf && Object.keys(child).length === 1)
        [key, child] = [`${key}/${Object.keys(child)[0]}`, Object.values(child)[0]];
      variants[key] = child.$leaf ?? [nodeUnion(child, '$in')];
    }
    return union(name, '$op', variants);
  };

  // A param's value: an argument of its number type (that of its first use), or a string, boolean or vec2 value.
  const paramValue = ref('value', 'ParamValue', () =>
    union(
      'ParamValue',
      'kind',
      Object.fromEntries(Object.keys(numbers).map((t) => [t, [arg('value', { or: [t, 'string', 'boolean'] })]])),
    ),
  );
  const named = (name: string, ...fields: Field[]) =>
    array(`${name}s`, { type: 'object', name, fields: [text('name'), ...fields] }, 255);
  const tags = (types.MathJson.or as string[]).map((m) => m.replace(/Json$/, ''));
  const params = named('param', enumeration('type', ['number', 'string', 'boolean', ...tags]), paramValue);
  const stamp = { type: 'int', name: 'stamp', min: 0, max: 0xffffffff };
  const fields = [stamp, params, named('output', source('value')), array('nodes', nodeUnion(tree, 'node'), 4095)];

  // One template per line; node unions one variant per line, nested by level.
  const write = (field: Field, indent: string): string => {
    if (field.items?.discriminator?.name === '$op')
      return JSON.stringify({ ...field, items: 0 }).replace('0}', `${write(field.items, indent)} }`);
    if (field.discriminator?.name !== '$op') return JSON.stringify(field);
    const inner = `${indent}  `;
    const variants = Object.entries<Field[]>(field.variants).map(([key, list]) =>
      list.length === 1 && list[0]!.discriminator?.name === '$op'
        ? `${inner}${JSON.stringify(key)}: [${write(list[0]!, inner)}]`
        : `${inner}${JSON.stringify(key)}: ${JSON.stringify(list)}`,
    );
    return `{ "type": "union", "name": ${JSON.stringify(field.name)}, "discriminator": ${JSON.stringify(field.discriminator)}, "variants": {\n${variants.join(',\n')}\n${indent}} }`;
  };
  return [
    '{',
    `  "definitions": [\n${definitions.map((d) => `    ${JSON.stringify(d)}`).join(',\n')}\n  ],`,
    `  "templates": [\n${templates.map((t) => `    ${JSON.stringify(t)}`).join(',\n')}\n  ],`,
    `  "fields": [\n${fields.map((f) => `    ${write(f, '    ')}`).join(',\n')}\n  ]`,
    '}',
    '',
  ].join('\n');
}
