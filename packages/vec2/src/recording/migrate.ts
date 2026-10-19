/**
 * Version 3 → version 4. Params become inputs; each node used exactly once (and not an output) is written into the
 * expression that uses it; every other node becomes a cell, in node order, so cells only refer to earlier ones.
 */
import { isRest, operationById, slotType, type Type } from '../../schema/schema';
import { checkDefinition, nameProblem, nonNull, roleOf, typeName } from '../../schema/typing';
import type { Cell, Definition, Expr, Input } from './definition';
import { DefinitionError } from './definition';
import type { ArgV3, DefinitionV3, NodeV3, SourceV3 } from './v3';

const fail = (message: string): never => {
  throw new DefinitionError(message);
};
const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
const isOmit = (arg: ArgV3 | undefined) =>
  arg === undefined || (typeof arg === 'object' && arg !== null && 'omit' in arg);

/** The params and their slot type, for each positional argument of a call node. */
function paramsOf(node: NodeV3) {
  if ('of' in node) return [];
  const op = operationById.get(node.op) ?? fail(`${node.op} is not a vec2 operation`);
  return op.params;
}

export function fromV3(definition: DefinitionV3): Definition {
  if (definition.version !== 3) fail(`Expected a version 3 definition, got version ${definition.version}`);
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));

  // A number param's type: the slot type of its first use (as the version 3 packing chose it).
  const roles = new Map<string, string>();
  const note = (arg: ArgV3 | undefined, type: Type) => {
    if (arg === null || typeof arg !== 'object') return;
    if (Array.isArray(arg)) {
      const item = Array.isArray(type) ? type[0]! : type;
      return arg.forEach((a) => note(a, item));
    }
    if ('param' in arg && !roles.has(arg.param)) {
      const role = roleOf(type);
      if (role) roles.set(arg.param, role);
    }
    if ('object' in arg && type && typeof type === 'object' && !Array.isArray(type))
      for (const [key, value] of Object.entries(arg.object))
        note(value, slotType((type as Record<string, Type>)[key] ?? 'unknown'));
  };
  for (const node of definition.nodes) {
    if ('of' in node) continue;
    const params = paramsOf(node);
    (node.args ?? []).forEach((arg, i) => {
      const rest = params.findIndex(([, slot]) => isRest(slot));
      const param = params[rest >= 0 && i >= rest ? rest : i];
      if (param) note(arg, slotType(param[1]));
    });
  }

  // Uses per node: one use (not an output) is inlined.
  const uses = new Map<string, number>();
  const use = (id: string) => uses.set(id, (uses.get(id) ?? 0) + 1);
  const useArg = (arg: ArgV3 | undefined): void => {
    if (arg === null || typeof arg !== 'object') return;
    if (Array.isArray(arg)) return arg.forEach(useArg);
    if ('ref' in arg) use(arg.ref);
    if ('object' in arg) Object.values(arg.object).forEach(useArg);
  };
  for (const node of definition.nodes) {
    if ('of' in node) use(node.of);
    else {
      if (typeof node.self === 'string') use(node.self);
      (node.args ?? []).forEach(useArg);
    }
  }
  const outputs = Object.entries(definition.outputs);
  const outputNodes = new Set(outputs.flatMap(([, s]) => (typeof s === 'string' ? [s] : [])));

  // Names: inputs keep theirs (made valid), output names first, then a name from the operation.
  const taken = new Set<string>();
  const unique = (base: string) => {
    let clean = base.replace(/[^\w$]/g, '_').replace(/^(\d)/, '_$1') || 'value';
    if (nameProblem(clean)) clean = `${lowerFirst(clean)}_`;
    let name = clean;
    const sep = /\d$/.test(clean) ? '_' : '';
    for (let i = 2; taken.has(name) || nameProblem(name); i++) name = `${clean}${sep}${i}`;
    taken.add(name);
    return name;
  };
  const inputNames = new Map(Object.keys(definition.params).map((param) => [param, unique(param)]));
  const cellNames = new Map<string, string>();
  for (const [name, source] of outputs)
    if (typeof source === 'string' && !cellNames.has(source)) cellNames.set(source, unique(name));
  const isCell = (id: string) => outputNodes.has(id) || uses.get(id) !== 1;
  for (const node of definition.nodes) {
    if (!isCell(node.id) || cellNames.has(node.id)) continue;
    const [owner, member] = 'of' in node ? ['', 'name' in node ? node.name : 'item'] : node.op.split('.');
    cellNames.set(node.id, unique(member === 'new' ? lowerFirst(owner!) : member!));
  }

  const source = (s: SourceV3): Expr =>
    typeof s === 'string'
      ? cellNames.has(s)
        ? { ref: cellNames.get(s)! }
        : expr(nodes.get(s) ?? fail(`Node ${s} is not defined`))
      : { ref: inputNames.get(s.param) ?? fail(`Unknown param ${s.param}`) };
  const arg = (a: ArgV3): Expr => {
    if (a === null || typeof a !== 'object') return a;
    if (Array.isArray(a)) return a.map(arg);
    if ('ref' in a) return source(a.ref);
    if ('param' in a) return source(a);
    if ('object' in a)
      return {
        object: Object.fromEntries(
          Object.entries(a.object)
            .filter(([, v]) => !isOmit(v))
            .map(([k, v]) => [k, arg(v)]),
        ),
      };
    if ('omit' in a) return fail('An omitted argument has no value');
    return a;
  };
  function expr(node: NodeV3): Expr {
    if ('of' in node)
      return 'index' in node ? { of: source(node.of), index: node.index } : { of: source(node.of), field: node.name };
    const params = paramsOf(node);
    const args: Record<string, Expr> = {};
    const given = node.args ?? [];
    params.forEach(([name, slot], i) => {
      if (isRest(slot)) {
        args[name] = given
          .slice(i)
          .filter((a) => !isOmit(a))
          .map(arg);
        if (!(args[name] as Expr[]).length) delete args[name];
      } else if (!isOmit(given[i])) args[name] = arg(given[i]!);
    });
    if (given.length > params.length && !params.some(([, slot]) => isRest(slot)))
      fail(`${node.op} takes ${params.length} arguments, ${given.length} given`);
    return {
      op: node.op,
      ...(node.self !== undefined && { self: source(node.self) }),
      ...(Object.keys(args).length && { args }),
    };
  }

  const inputs: Input[] = Object.entries(definition.params).map(([param, { type, value }]) => ({
    name: inputNames.get(param)!,
    type: type === 'number' ? (roles.get(param) ?? 'Coordinate') : type,
    value: arg(value),
  }));
  const cells: Cell[] = [];
  const outputNames = new Map<string, string[]>();
  for (const [name, s] of outputs) {
    const key = typeof s === 'string' ? s : `param:${s.param}`;
    outputNames.set(key, [...(outputNames.get(key) ?? []), name]);
  }
  for (const node of definition.nodes) {
    if (!isCell(node.id)) continue;
    const name = cellNames.get(node.id)!;
    cells.push({ name, expr: expr(node), ...(outputNodes.has(node.id) && { output: true as const }) });
    // Further output names of the same node, as cells that refer to it.
    for (const alias of (outputNames.get(node.id) ?? []).slice(1))
      cells.push({ name: unique(alias), expr: { ref: name }, output: true });
  }
  for (const [key, names] of outputNames) {
    if (!key.startsWith('param:')) continue;
    for (const alias of names)
      cells.push({ name: unique(alias), expr: { ref: inputNames.get(key.slice(6))! }, output: true });
  }
  // Outputs state their type: the one each output's value has.
  const migrated: Definition = { format: 'vec2-definition', version: 4, inputs, functions: [], cells };
  const { refs } = checkDefinition(migrated);
  for (const cell of cells) {
    const type = refs.get(cell.name);
    if (cell.output && type && type !== 'unknown') cell.type = typeName(nonNull(type));
  }
  return migrated;
}
