/** Picking presets for a definition: the cheapest ones that keep every literal exactly. */
import type { ArgV3 as Arg, DefinitionV3 as Definition } from '@dirty-geometry/vec2/recording/v3';
import { NUMBER_TYPES } from '@dirty-geometry/vec2/schema/schema';
import {
  createDefinitionSchema,
  decodeDefinition,
  encodeDefinition,
  type ActivePresets,
  type DenseDefinitionSchema,
} from '@dirty-geometry/vec2/schema/dense/definition';

/** Renumber node ids by position (`n0`, `n1`, …), as decoding does, so definitions can be compared. */
export function normaliseDefinition(definition: Definition): Definition {
  const ids = new Map(definition.nodes.map((node, i) => [node.id, `n${i}`]));
  const id = <T>(source: T) => (typeof source === 'string' ? (ids.get(source) ?? source) : source);
  const arg = (value: Arg): Arg =>
    Array.isArray(value)
      ? value.map(arg)
      : value && typeof value === 'object' && 'ref' in value
        ? { ref: id(value.ref) }
        : value && typeof value === 'object' && 'object' in value
          ? { object: Object.fromEntries(Object.entries(value.object).map(([key, item]) => [key, arg(item)])) }
          : value;
  const nodes = definition.nodes.map((node) => {
    const renamed = { ...node, id: id(node.id) } as Record<string, any>;
    if ('of' in node) renamed.of = id(node.of);
    if ('self' in node && node.self !== undefined) renamed.self = id(node.self);
    if ('args' in node && node.args) renamed.args = node.args.map(arg);
    return renamed as Definition['nodes'][number];
  });
  const outputs = Object.fromEntries(Object.entries(definition.outputs).map(([name, source]) => [name, id(source)]));
  return { ...definition, nodes, outputs };
}

/** Literal changes a round trip through `presets` makes, as `path: before → after`. */
export function quantisationReport(
  definition: Definition,
  presets: ActivePresets = {},
  schema = createDefinitionSchema(),
) {
  const before = normaliseDefinition(definition);
  const after = decodeDefinition(encodeDefinition(definition, presets, schema), schema).definition;
  const changes: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        walk((a as any)[key], (b as any)[key], `${path}.${key}`);
    } else if (a !== b && !(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12)) {
      changes.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
  };
  walk(before.params, after.params, 'params');
  walk(before.nodes, after.nodes, 'nodes');
  return changes;
}

/** Bits one number takes with a preset. */
export const presetBits = (preset: { min: number; max: number; precision?: number }) =>
  Math.ceil(Math.log2((preset.max - preset.min) / (preset.precision ?? 1) + 1));

/** Preset names of a role, cheapest first. */
export function presetsByCost(schema: DenseDefinitionSchema, role: string): string[] {
  const definition = schema.schema.definitions?.find((candidate) => candidate.name === role);
  if (!definition) return [];
  return Object.entries(definition.presets)
    .sort(([, a], [, b]) => presetBits(a) - presetBits(b))
    .map(([name]) => name);
}

function fits(definition: Definition, presets: ActivePresets, schema: DenseDefinitionSchema): boolean {
  try {
    return quantisationReport(definition, presets, schema).length === 0;
  } catch {
    return false;
  }
}

/**
 * For each role, the cheapest preset under which the definition round-trips unchanged (keeping the other
 * number types fixed). Types where no range is exact keep `current`.
 */
export function choosePresets(
  definition: Definition,
  current: ActivePresets = {},
  schema: DenseDefinitionSchema = createDefinitionSchema(),
  roles: readonly string[] = NUMBER_TYPES,
): ActivePresets {
  const chosen: ActivePresets = { ...current };
  for (const role of roles) {
    for (const name of presetsByCost(schema, role)) {
      if (fits(definition, { ...chosen, [role]: name }, schema)) {
        chosen[role] = name;
        break;
      }
    }
  }
  return chosen;
}
