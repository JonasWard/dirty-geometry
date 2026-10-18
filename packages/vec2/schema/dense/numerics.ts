/** One densing numeric definition per role, with presets (the first is the default); payloads pick one per role. */
import type { DenseField, DenseSchema, NumericDefinition, NumericPreset } from 'densing';
import { ROLES, type Role } from '../schema';

export type ActivePresets = Partial<Record<Role, string>>;
export type NumericOptions = { custom?: Partial<Record<Role, Record<string, NumericPreset>>> };

const r = (min: number, max: number, precision?: number) => (precision ? { min, max, precision } : { min, max });
const scales = [1, 10, 100, 1000, 10000].flatMap((s) => [1, 0.1, 0.01, 0.001, 0.0001].map((p) => [s, p] as const));
const coordinates: Record<string, NumericPreset> = {};
for (const [s, p] of scales) Object.assign(coordinates, { [`0..${s}@${p}`]: r(0, s, p), [`±${s}@${p}`]: r(-s, s, p) });
export const PRESETS: Record<Role, Record<string, NumericPreset>> = {
  coordinate: { '±100@0.01': r(-100, 100, 0.01), ...coordinates },
  angle: { 'rad@0.001': r(-7, 7, 0.001), 'rad@0.01': r(-7, 7, 0.01), 'rad@0.0001': r(-7, 7, 0.0001) },
  parameter: { 't@0.001': r(0, 1, 0.001), 't@0.01': r(0, 1, 0.01), 't@0.0001': r(0, 1, 0.0001) },
  integer: { '±1024': r(-1024, 1024), uint8: r(0, 255), grid: r(-(2 ** 25), 2 ** 25 - 1) },
  epsilon: { '±1@1e-6': r(-1, 1, 1e-6), '±0.01@1e-9': r(-0.01, 0.01, 1e-9) },
};

export const createNumerics = (options: NumericOptions = {}): NumericDefinition[] =>
  ROLES.map((name) => ({ name, presets: { ...PRESETS[name], ...options.custom?.[name] } }));

export function resolvePreset(definitions: readonly NumericDefinition[], role: Role, active: ActivePresets = {}) {
  const presets = definitions.find((definition) => definition.name === role)?.presets ?? {};
  const name = active[role] ?? Object.keys(presets)[0]!;
  if (!presets[name]) throw new Error(`Unknown ${role} preset ${name}`);
  return { ...presets[name], name };
}

/** Numbers snapped onto the active presets' grids, since densing rejects numbers off the grid. */
export function snap(schema: DenseSchema, data: Record<string, any>): Record<string, any> {
  const grid = (value: number, { min, precision = 1 }: NumericPreset) =>
    Number((min + Math.round((value - min) / precision) * precision).toPrecision(12));
  const preset = (role: string) => resolvePreset(schema.definitions!, role as Role, data.$presets);
  const walk = (f: DenseField, value: any): any => {
    if (value === null || value === undefined) return value;
    if (f.type === 'fixed') return grid(value, f);
    if (f.type === 'reference_numeric') return grid(value, preset(f.ref));
    if (f.type === 'reference') return walk(schema.templates![f.ref as number]!, value);
    if (f.type === 'optional') return walk(f.field, value);
    if (f.type === 'array') return value.map((item: unknown) => walk(f.items, item));
    const fields = f.type === 'object' ? f.fields : f.type === 'union' ? f.variants[value[f.discriminator.name]] : null;
    return fields ? { ...value, ...Object.fromEntries(fields.map((c) => [c.name, walk(c, value[c.name])])) } : value;
  };
  return walk({ type: 'object', name: '', fields: schema.fields } as DenseField, data);
}
