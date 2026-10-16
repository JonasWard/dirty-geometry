/** Picking presets for a definition: the cheapest ones that keep every literal exactly. */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { createDefinitionSchema, type DenseDefinitionSchema } from './definition-schema';
import { quantisationReport } from './convert';
import { NUMERIC_ROLES, type ActivePresets, type NumericRole } from './numerics';

/** Bits one number takes with a preset. */
export const presetBits = (preset: { min: number; max: number; precision?: number }) =>
  Math.ceil(Math.log2((preset.max - preset.min) / (preset.precision ?? 1) + 1));

/** Preset names of a role, cheapest first. */
export function presetsByCost(schema: DenseDefinitionSchema, role: NumericRole): string[] {
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
 * roles fixed). Roles where no preset is exact keep `current`.
 */
export function choosePresets(
  definition: Definition,
  current: ActivePresets = {},
  schema: DenseDefinitionSchema = createDefinitionSchema(),
  roles: readonly NumericRole[] = NUMERIC_ROLES,
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
