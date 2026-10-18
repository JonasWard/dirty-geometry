/**
 * Recorded definitions as TypeScript: recorder code that, when run (see run.ts), records the same
 * definition again. Stored vec2 values print as `value({...codec JSON})`, so they stay stored values.
 */
import type { ArgV3 as Arg, CallNodeV3 as CallNode, DefinitionV3 as Definition, NodeV3 as Node, SourceV3 as Source } from '@dirty-geometry/vec2/recording/v3';
import { operations } from '@dirty-geometry/vec2/schema/schema';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set([
  'rec',
  'value',
  'createRecorder',
  'new',
  'const',
  'let',
  'var',
  'function',
  'return',
  'class',
  'default',
  'delete',
  'in',
  'of',
  'do',
  'if',
  'for',
  'while',
  'switch',
  'case',
  'this',
  'typeof',
  'void',
  'with',
  'yield',
]);

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A single-quoted string literal. */
const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  return Object.is(value, -0) ? '-0' : String(value);
}

function formatJson(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (Array.isArray(value)) return `[${value.map(formatJson).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(
      ([key, field]) => `${IDENTIFIER.test(key) ? key : quote(key)}: ${formatJson(field)}`,
    );
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }
  if (typeof value === 'string') return quote(value);
  return JSON.stringify(value) ?? 'undefined';
}

function formatArg(arg: Arg, names: ReadonlyMap<string, string>): string {
  if (arg === null || typeof arg !== 'object') return formatJson(arg);
  if (Array.isArray(arg)) return `[${arg.map((item) => formatArg(item, names)).join(', ')}]`;
  if ('ref' in arg) return names.get(arg.ref) ?? arg.ref;
  if ('param' in arg) return names.get(`param:${arg.param}`) ?? arg.param;
  if ('number' in arg) return arg.number;
  if ('omit' in arg) return 'undefined';
  if ('value' in arg) return `value(${formatJson(arg.value)})`;
  const entries = Object.entries(arg.object).map(
    ([key, field]) => `${IDENTIFIER.test(key) ? key : quote(key)}: ${formatArg(field, names)}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

const ref = (source: Source, names: ReadonlyMap<string, string>) =>
  typeof source === 'string' ? (names.get(source) ?? source) : (names.get(`param:${source.param}`) ?? source.param);
/** `Vec2.add` → owner `Vec2`, member `add`; a helper (`helpers.name`) is called without an owner. */
const split = (op: string) => {
  const [owner, member] = op.split('.') as [string, string];
  return owner === 'helpers' ? (['', member] as const) : ([owner, member] as const);
};

/** A readable, unique variable name per param (`param:<name>`) and node. */
function nodeNames(definition: Definition): Map<string, string> {
  const used = new Set<string>();
  const unique = (base: string) => {
    const clean = base.replace(/[^\w$]/g, '_').replace(/^(\d)/, '_$1') || 'v';
    let name = RESERVED.has(clean) ? `${clean}_` : clean;
    for (let i = 2; used.has(name); i++) name = `${clean}${i}`;
    used.add(name);
    return name;
  };
  const outputByNode = new Map(Object.entries(definition.outputs).map(([name, node]) => [node, name]));
  const names = new Map(Object.keys(definition.params).map((param) => [`param:${param}`, unique(param)]));
  for (const node of definition.nodes) {
    const [owner, member] = split(node.op);
    const output = outputByNode.get(node.id);
    const base =
      output ?? ('of' in node ? ('name' in node ? node.name : 'item') : member === 'new' ? lowerFirst(owner) : member);
    names.set(node.id, unique(base));
  }
  return names;
}

function statement(node: Node, names: ReadonlyMap<string, string>): string {
  const name = names.get(node.id)!;
  if ('of' in node && 'index' in node) return `const ${name} = ${ref(node.of, names)}[${node.index}];`;
  if ('of' in node) {
    const access = IDENTIFIER.test(node.name) ? `.${node.name}` : `[${quote(node.name)}]`;
    return `const ${name} = ${ref(node.of, names)}${access};`;
  }
  const { op, self, args = [] } = node as CallNode;
  const [owner, member] = split(op);
  const target = self !== undefined ? ref(self, names) : owner;
  const call = `(${args.map((arg) => formatArg(arg, names)).join(', ')})`;
  const isRead = operations.find((entry) => entry.id === op && entry.static === (self === undefined))?.value;
  if (member === 'new' && self === undefined) return `const ${name} = new ${owner}${call};`;
  return `const ${name} = ${target ? `${target}.` : ''}${member}${isRead ? '' : call};`;
}

/** TypeScript recorder code for `definition`. */
export function definitionToTypeScript(definition: Definition): string {
  const names = nodeNames(definition);
  const classes = new Set<string>();
  const helpers = new Set<string>();
  for (const node of definition.nodes) {
    if ('of' in node) continue;
    const [owner, member] = split(node.op);
    if (!owner) helpers.add(member);
    else if ((node as CallNode).self === undefined) classes.add(owner);
  }
  const lines = [
    '// Edit and apply: this code runs through the vec2 recorder and becomes the definition.',
    '// `value(json)` is a stored vec2 value; loops and arithmetic run once and are recorded as literals.',
    'const rec = createRecorder();',
  ];
  if (classes.size > 0) lines.push(`const { ${[...classes].sort().join(', ')} } = rec.lib;`);
  if (helpers.size > 0) lines.push(`const { ${[...helpers].sort().join(', ')} } = rec.lib.helpers;`);
  lines.push('');
  for (const [param, { value }] of Object.entries(definition.params)) {
    lines.push(`const ${names.get(`param:${param}`)} = rec.param(${quote(param)}, ${formatArg(value, names)});`);
  }
  for (const node of definition.nodes) lines.push(statement(node, names));
  lines.push('');
  for (const [output, source] of Object.entries(definition.outputs)) {
    lines.push(`rec.output(${quote(output)}, ${ref(source, names)});`);
  }
  return `${lines.join('\n')}\n`;
}
