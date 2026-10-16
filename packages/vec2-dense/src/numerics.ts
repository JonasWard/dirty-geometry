/**
 * The shared numeric definitions of the vec2 dense schemas. Every number is a `referenceNumeric` of one of
 * these; which preset applies is chosen once per payload (densing's `$presets`).
 */
import type { NumericDefinition, NumericPreset } from 'densing';

export const NUMERIC_ROLES = ['coordinate', 'angle', 'parameter', 'integer'] as const;
export type NumericRole = (typeof NUMERIC_ROLES)[number];

export const COORDINATE_SCALES = [1, 10, 100, 1000, 10000] as const;
export const COORDINATE_PRECISIONS = [1, 0.1, 0.01, 0.001, 0.0001] as const;

/** `0..10@0.01` (positive domain) or `±10@0.01` (negative-positive domain). */
export const coordinatePresetName = (scale: number, signed: boolean, precision: number) =>
  `${signed ? '±' : '0..'}${scale}@${precision}`;

function coordinatePresets(): Record<string, NumericPreset> {
  const presets: Record<string, NumericPreset> = {};
  for (const scale of COORDINATE_SCALES) {
    for (const signed of [false, true]) {
      for (const precision of COORDINATE_PRECISIONS) {
        presets[coordinatePresetName(scale, signed, precision)] = { min: signed ? -scale : 0, max: scale, precision };
      }
    }
  }
  return presets;
}

/**
 * vec2 angles are radians (and may be negative). densing needs decimal precisions, so the degree presets
 * store degrees in [-360, 360] and the converters translate (see `NumericContext` in values.ts); the radian
 * preset stores radians directly.
 */
function anglePresets(): Record<string, NumericPreset> {
  return {
    'deg@1': { min: -360, max: 360, precision: 1 },
    'deg@0.1': { min: -360, max: 360, precision: 0.1 },
    'deg@0.01': { min: -360, max: 360, precision: 0.01 },
    'rad@0.001': { min: -6.284, max: 6.284, precision: 0.001 },
  };
}

/** Whether an angle preset stores degrees (the value is converted from and to radians). */
export const isDegreePreset = (name: string) => name.startsWith('deg');

const parameterPresets = (): Record<string, NumericPreset> => ({
  't@0.01': { min: 0, max: 1, precision: 0.01 },
  't@0.001': { min: 0, max: 1, precision: 0.001 },
  't@0.0001': { min: 0, max: 1, precision: 0.0001 },
  'extended@0.001': { min: -1, max: 2, precision: 0.001 },
});

const integerPresets = (): Record<string, NumericPreset> => ({
  uint8: { min: 0, max: 255 },
  '±1024': { min: -1024, max: 1024 },
  grid: { min: -(2 ** 25), max: 2 ** 25 - 1 },
});

export const DEFAULT_PRESETS: Readonly<Record<NumericRole, string>> = {
  coordinate: coordinatePresetName(100, true, 0.01),
  angle: 'deg@0.1',
  parameter: 't@0.001',
  integer: '±1024',
};

/** A user-defined preset; `precision` omitted means integers. */
export type CustomPreset = { min: number; max: number; precision?: number };

export type NumericOptions = {
  /** Extra presets per role, appended after the built-in ones (names must not clash). */
  custom?: Partial<Record<NumericRole, Record<string, CustomPreset>>>;
};

const builtIn: Record<NumericRole, () => Record<string, NumericPreset>> = {
  coordinate: coordinatePresets,
  angle: anglePresets,
  parameter: parameterPresets,
  integer: integerPresets,
};

/** The four numeric definitions, with any custom presets added. */
export function createNumerics(options: NumericOptions = {}): NumericDefinition[] {
  return NUMERIC_ROLES.map((role) => {
    const presets = builtIn[role]();
    for (const [name, preset] of Object.entries(options.custom?.[role] ?? {})) {
      if (presets[name]) throw new Error(`Custom ${role} preset ${name} clashes with a built-in preset`);
      if (!(preset.max > preset.min)) throw new Error(`Custom ${role} preset ${name}: max must be above min`);
      if (preset.precision !== undefined && !(preset.precision > 0)) {
        throw new Error(`Custom ${role} preset ${name}: precision must be positive`);
      }
      presets[name] = preset.precision === undefined ? { min: preset.min, max: preset.max } : { ...preset };
    }
    return { name: role, presets, defaultPreset: DEFAULT_PRESETS[role] };
  });
}

/** Active preset per role; missing roles use the defaults. */
export type ActivePresets = Partial<Record<NumericRole, string>>;

export function resolvePreset(
  definitions: readonly NumericDefinition[],
  role: NumericRole,
  active: ActivePresets = {},
): NumericPreset & { name: string } {
  const definition = definitions.find((candidate) => candidate.name === role);
  if (!definition) throw new Error(`No numeric definition ${role}`);
  const name = active[role] ?? definition.defaultPreset ?? Object.keys(definition.presets)[0]!;
  const preset = definition.presets[name];
  if (!preset) throw new Error(`Unknown ${role} preset ${name}`);
  return { ...preset, name };
}

/** Snap `value` onto the preset's grid (integers when it has no precision); throws when out of range. */
export function quantise(value: number, preset: NumericPreset & { name: string }, label = 'value'): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label}: ${value} is not finite`);
  const step = preset.precision ?? 1;
  const steps = Math.round((value - preset.min) / step);
  const snapped = preset.min + steps * step;
  const tolerance = step / 2;
  if (snapped < preset.min - tolerance || snapped > preset.max + tolerance) {
    throw new RangeError(`${label}: ${value} is outside preset ${preset.name} [${preset.min}, ${preset.max}]`);
  }
  // For decimal steps keep the digits the precision implies, so 0.1 + 0.2 style noise does not reach densing.
  const decimals = -Math.log10(step);
  if (Math.abs(decimals - Math.round(decimals)) < 1e-9)
    return Number(snapped.toFixed(Math.max(0, Math.round(decimals))));
  return snapped;
}
