/**
 * The playground URL: `<options>/<definition>`, both densing strings. Options carry the custom presets;
 * the large definition schema is rebuilt from them, so it never travels in the URL.
 */
import { array, densing, enumArray, enumeration, int, object, optional, schema, undensing } from 'densing';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { ROLES, type Role } from '@dirty-geometry/vec2/schema/schema';
import {
  createDefinitionSchema,
  decodeDefinition,
  encodeDefinition,
} from '@dirty-geometry/vec2/schema/dense/definition';
import type { NumericPreset as CustomPreset } from 'densing';
import type { ActivePresets, NumericOptions } from '@dirty-geometry/vec2/schema/dense/numerics';

const NAME_CHARS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$-.@±'];
const NUMBER_CHARS = [...'0123456789.-e'];
const text = (name: string, chars: string[]) => enumArray(name, enumeration('char', chars), 0, 24);
const toChars = (value: string, chars: string[], label: string) => {
  const bad = [...value].find((char) => !chars.includes(char));
  if (bad) throw new Error(`${label}: "${bad}" cannot be stored`);
  return [...value];
};
const fromChars = (chars: string[]) => chars.join('');

const optionsSchema = schema(
  int('version', 0, 15),
  array(
    'custom',
    0,
    32,
    object(
      'preset',
      enumeration('role', ROLES),
      text('name', NAME_CHARS),
      text('min', NUMBER_CHARS),
      text('max', NUMBER_CHARS),
      optional('precision', text('precision', NUMBER_CHARS)),
    ),
  ),
);

const numberChars = (value: number, label: string) => toChars(String(value), NUMBER_CHARS, label);

export function encodeOptions(options: NumericOptions): string {
  const custom = ROLES.flatMap((role) =>
    Object.entries(options.custom?.[role] ?? {}).map(([name, preset]) => ({
      role,
      name: toChars(name, NAME_CHARS, `preset ${name}`),
      min: numberChars(preset.min, `preset ${name}.min`),
      max: numberChars(preset.max, `preset ${name}.max`),
      precision: preset.precision === undefined ? null : numberChars(preset.precision, `preset ${name}.precision`),
    })),
  );
  return densing(optionsSchema, { version: 1, custom });
}

export function decodeOptions(text: string): NumericOptions {
  const data = undensing(optionsSchema, text) as { custom: Record<string, any>[] };
  const custom: Partial<Record<Role, Record<string, CustomPreset>>> = {};
  for (const preset of data.custom) {
    const role = preset.role as Role;
    custom[role] = {
      ...(custom[role] ?? {}),
      [fromChars(preset.name)]: {
        min: Number(fromChars(preset.min)),
        max: Number(fromChars(preset.max)),
        ...(preset.precision ? { precision: Number(fromChars(preset.precision)) } : {}),
      },
    };
  }
  return Object.keys(custom).length > 0 ? { custom } : {};
}

export type PlaygroundState = { options: NumericOptions; presets: ActivePresets; definition: Definition };

/** `<options>/<definition>` for the URL hash. */
export function encodePlaygroundHash(state: PlaygroundState): string {
  const schema = createDefinitionSchema(state.options);
  return `${encodeOptions(state.options)}/${encodeDefinition(state.definition, state.presets, schema)}`;
}

export function decodePlaygroundHash(hash: string): PlaygroundState {
  const [options, definition] = hash.replace(/^#?\/?/, '').split('/');
  if (!options || !definition) throw new Error('The link has no definition');
  const decodedOptions = decodeOptions(options);
  const decoded = decodeDefinition(definition, createDefinitionSchema(decodedOptions));
  return { options: decodedOptions, presets: decoded.presets, definition: decoded.definition };
}
