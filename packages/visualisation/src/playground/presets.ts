/** Picking presets for a definition: the cheapest ranges that keep every number literal exactly. */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { NUMBER_TYPES } from '@dirty-geometry/vec2/schema/schema';
import {
  createDefinitionSchema,
  numberLiterals,
  resolvePreset,
  snapTo,
  type ActivePresets,
  type CustomPreset,
  type DenseDefinitionSchema,
} from '@dirty-geometry/vec2/schema/dense/definition';

const same = (a: number, b: number) => Math.abs(a - b) < 1e-12;
/** Whether `value` packs exactly with `preset`. */
const exact = (value: number, preset: CustomPreset) =>
  value >= preset.min - 1e-12 && value <= preset.max + 1e-12 && same(snapTo(value, preset), value);

/** The literals packing with `presets` would change, as `Type: before → after` (out of range: `→ out of range`). */
export function quantisationReport(
  definition: Definition,
  presets: ActivePresets = {},
  schema = createDefinitionSchema(),
): string[] {
  let literals: Map<string, number[]>;
  try {
    literals = numberLiterals(definition, schema);
  } catch {
    return [];
  }
  const changes: string[] = [];
  for (const [type, values] of literals) {
    const preset = resolvePreset(schema.schema.definitions ?? [], type, presets);
    for (const value of new Set(values)) {
      if (exact(value, preset)) continue;
      const inside = value >= preset.min && value <= preset.max;
      changes.push(
        `${type} ${value} → ${inside ? snapTo(value, preset) : `out of range [${preset.min}, ${preset.max}]`}`,
      );
    }
  }
  return changes;
}

/** Bits one number takes with a preset. */
export const presetBits = (preset: { min: number; max: number; precision?: number }) =>
  Math.ceil(Math.log2((preset.max - preset.min) / (preset.precision ?? 1) + 1));

/** Preset names of a number type, cheapest first. */
export function presetsByCost(schema: DenseDefinitionSchema, role: string): string[] {
  const definition = schema.schema.definitions?.find((candidate) => candidate.name === role);
  if (!definition) return [];
  return Object.entries(definition.presets)
    .sort(([, a], [, b]) => presetBits(a) - presetBits(b))
    .map(([name]) => name);
}

/**
 * For each number type, the cheapest preset that keeps all its literals exactly. Types where no range is exact
 * keep `current`; types without literals keep `current` or their default.
 */
export function choosePresets(
  definition: Definition,
  current: ActivePresets = {},
  schema: DenseDefinitionSchema = createDefinitionSchema(),
  roles: readonly string[] = NUMBER_TYPES,
): ActivePresets {
  let literals: Map<string, number[]>;
  try {
    literals = numberLiterals(definition, schema);
  } catch {
    return { ...current };
  }
  const chosen: ActivePresets = { ...current };
  const definitions = schema.schema.definitions ?? [];
  for (const role of roles) {
    const values = [...new Set(literals.get(role) ?? [])];
    if (!values.length) continue;
    const name = presetsByCost(schema, role).find((candidate) =>
      values.every((v) => exact(v, resolvePreset(definitions, role, { [role]: candidate }))),
    );
    if (name) chosen[role] = name;
  }
  return chosen;
}
