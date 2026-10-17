/**
 * Recorded definitions as TypeScript: recorder code that, when run (see run.ts), records the same
 * definition again. Stored vec2 values print as `value({...codec JSON})`, so they stay stored values.
 */
import type { ArgJson, Definition, NodeJson } from '@dirty-geometry/vec2/recording/definition';
import { operationOf } from './definition-schema';

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

function formatArg(arg: ArgJson, names: ReadonlyMap<string, string>): string {
  if ('ref' in arg) return names.get(arg.ref) ?? arg.ref;
  if ('lit' in arg) return formatJson(arg.lit);
  if ('number' in arg) return arg.number;
  if ('undefined' in arg) return 'undefined';
  if ('value' in arg) return `value(${formatJson(arg.value)})`;
  if ('array' in arg) return `[${arg.array.map((item) => formatArg(item, names)).join(', ')}]`;
  const entries = Object.entries(arg.object).map(
    ([key, field]) => `${IDENTIFIER.test(key) ? key : quote(key)}: ${formatArg(field, names)}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

/** A readable, unique variable name per node. */
function nodeNames(definition: Definition): Map<string, string> {
  const used = new Set<string>();
  const unique = (base: string) => {
    const clean = base.replace(/[^\w$]/g, '_').replace(/^(\d)/, '_$1') || 'v';
    let name = RESERVED.has(clean) ? `${clean}_` : clean;
    for (let i = 2; used.has(name); i++) name = `${clean}${i}`;
    used.add(name);
    return name;
  };
  const paramByNode = new Map(Object.entries(definition.params).map(([name, param]) => [param.node, name]));
  const outputByNode = new Map(Object.entries(definition.outputs).map(([name, node]) => [node, name]));
  const names = new Map<string, string>();
  for (const node of definition.nodes) {
    const param = paramByNode.get(node.id);
    const output = outputByNode.get(node.id);
    let base: string;
    if (param) base = param;
    else if (output) base = output;
    else if (node.op === 'item' || node.op === 'field' || node.op === 'param')
      base = node.op === 'field' && 'name' in node ? node.name : 'item';
    else {
      const op = operationOf(node.op);
      base = !op ? 'v' : op.kind === 'constructor' ? lowerFirst(op.owner ?? 'value') : op.member;
    }
    names.set(node.id, unique(base));
  }
  return names;
}

function statement(node: NodeJson, names: ReadonlyMap<string, string>, definition: Definition): string {
  const name = names.get(node.id)!;
  if (node.op === 'param' && 'name' in node && !('of' in node)) {
    const entry = Object.entries(definition.params).find(([, param]) => param.node === node.id);
    const [paramName, param] = entry ?? [node.name, undefined];
    const value = param ? formatArg(param.value, names) : 'undefined';
    return `const ${name} = rec.param(${quote(paramName)}, ${value});`;
  }
  if (node.op === 'item' && 'index' in node) return `const ${name} = ${names.get(node.of)}[${node.index}];`;
  if (node.op === 'field' && 'of' in node && 'name' in node) {
    const access = IDENTIFIER.test(node.name) ? `.${node.name}` : `[${quote(node.name)}]`;
    return `const ${name} = ${names.get(node.of)}${access};`;
  }
  if (!('args' in node)) return `// unsupported node ${node.id}`;
  const op = operationOf(node.op);
  if (!op) return `// unknown operation ${node.op}`;
  const args = node.args.map((arg) => formatArg(arg, names)).join(', ');
  const self = node.self ? names.get(node.self) : undefined;
  switch (op.kind) {
    case 'constructor':
      return `const ${name} = new ${op.owner}(${args});`;
    case 'static':
      return `const ${name} = ${op.owner}.${op.member}(${args});`;
    case 'constant':
      return `const ${name} = ${op.owner}.${op.member};`;
    case 'method':
      return `const ${name} = ${self}.${op.member}(${args});`;
    case 'field':
      return `const ${name} = ${self}.${op.member};`;
    case 'function':
      return `const ${name} = ${op.member}(${args});`;
  }
}

/** TypeScript recorder code for `definition`. */
export function definitionToTypeScript(definition: Definition): string {
  const names = nodeNames(definition);
  const classes = new Set<string>();
  const helpers = new Set<string>();
  for (const node of definition.nodes) {
    const op = 'args' in node ? operationOf(node.op) : undefined;
    if (!op) continue;
    if (op.kind === 'function') helpers.add(op.member);
    else if (op.kind !== 'method' && op.kind !== 'field' && op.owner) classes.add(op.owner);
  }

  const lines = [
    '// Edit and apply: this code runs through the vec2 recorder and becomes the definition.',
    '// `value(json)` is a stored vec2 value; loops and arithmetic run once and are recorded as literals.',
    'const rec = createRecorder();',
  ];
  if (classes.size > 0) lines.push(`const { ${[...classes].sort().join(', ')} } = rec.lib;`);
  if (helpers.size > 0) lines.push(`const { ${[...helpers].sort().join(', ')} } = rec.lib.helpers;`);
  lines.push('');
  for (const node of definition.nodes) lines.push(statement(node, names, definition));
  lines.push('');
  for (const [output, node] of Object.entries(definition.outputs)) {
    lines.push(`rec.output(${quote(output)}, ${names.get(node)});`);
  }
  return `${lines.join('\n')}\n`;
}
