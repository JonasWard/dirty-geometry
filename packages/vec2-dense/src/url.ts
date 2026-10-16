/**
 * The playground URL: `<options>/<definition>`, both densing strings. Options carry the custom presets;
 * the large definition schema is rebuilt from them, so it never travels in the URL.
 */
import { densing, schemaFromJson, undensing } from 'densing';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { createDefinitionSchema } from './definition-schema';
import { decodeDefinition, encodeDefinition } from './convert';
import {
  NUMERIC_ROLES,
  type ActivePresets,
  type CustomPreset,
  type NumericOptions,
  type NumericRole,
} from './numerics';
import { fromChars, NAME_CHARS, textField, toChars } from './text';
import { arr, enumField, intField, obj, opt } from './values';

const NUMBER_CHARS = [...'0123456789.-e'];

const optionsSchema = schemaFromJson({
  fields: [
    intField('version', 0, 15),
    arr(
      'custom',
      0,
      32,
      obj(
        'preset',
        enumField('role', NUMERIC_ROLES),
        textField('name', [...NAME_CHARS, '.', '@', '±']),
        textField('min', NUMBER_CHARS, 24),
        textField('max', NUMBER_CHARS, 24),
        opt('precision', textField('precision', NUMBER_CHARS, 24)),
      ),
    ),
  ],
});

const numberChars = (value: number, label: string) => toChars(String(value), NUMBER_CHARS, label, 24);

export function encodeOptions(options: NumericOptions): string {
  const custom = NUMERIC_ROLES.flatMap((role) =>
    Object.entries(options.custom?.[role] ?? {}).map(([name, preset]) => ({
      role,
      name: toChars(name, [...NAME_CHARS, '.', '@', '±'], `preset ${name}`),
      min: numberChars(preset.min, `preset ${name}.min`),
      max: numberChars(preset.max, `preset ${name}.max`),
      precision: preset.precision === undefined ? null : numberChars(preset.precision, `preset ${name}.precision`),
    })),
  );
  return densing(optionsSchema, { version: 1, custom });
}

export function decodeOptions(text: string): NumericOptions {
  const data = undensing(optionsSchema, text) as { custom: Record<string, any>[] };
  const custom: Partial<Record<NumericRole, Record<string, CustomPreset>>> = {};
  for (const preset of data.custom) {
    const role = preset.role as NumericRole;
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
