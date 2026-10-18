/**
 * The playground URL: `4/<options>/<definition>`, both densing strings. Options carry the custom presets;
 * the large definition schema is rebuilt from them, so it never travels in the URL.
 */
import { array, densing, enumArray, enumeration, int, object, optional, schema, undensing } from 'densing';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { NUMBER_TYPES } from '@dirty-geometry/vec2/schema/schema';
import {
  createDefinitionSchema,
  decodeDefinition,
  encodeDefinition,
} from '@dirty-geometry/vec2/schema/dense/definition';
import type { NumericPreset as CustomPreset } from 'densing';
import type { ActivePresets, NumericOptions } from '@dirty-geometry/vec2/schema/dense/definition';

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
      enumeration('role', NUMBER_TYPES),
      text('name', NAME_CHARS),
      text('min', NUMBER_CHARS),
      text('max', NUMBER_CHARS),
      optional('precision', text('precision', NUMBER_CHARS)),
    ),
  ),
);

const numberChars = (value: number, label: string) => toChars(String(value), NUMBER_CHARS, label);

export function encodeOptions(options: NumericOptions): string {
  const custom = NUMBER_TYPES.flatMap((role) =>
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
  const custom: Record<string, Record<string, CustomPreset>> = {};
  for (const preset of data.custom) {
    const role = preset.role as string;
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
/** The first segment of a version 4 hash; a version 3 link has no version segment. */
export const HASH_VERSION = '4';

/** `4/<options>/<definition>` for the URL hash. */
export function encodePlaygroundHash(state: PlaygroundState): string {
  const schema = createDefinitionSchema(state.options);
  return `${HASH_VERSION}/${encodeOptions(state.options)}/${encodeDefinition(state.definition, state.presets, schema)}`;
}

const segments = (hash: string) => hash.replace(/^#?\/?/, '').split('/');
/** Whether a hash is a link from before version 4 (`<options>/<definition>`), which `readPlaygroundHash` upgrades. */
export const isLegacyHash = (hash: string) => segments(hash).length === 2;

/** A version 4 hash. */
export function decodePlaygroundHash(hash: string): PlaygroundState {
  const [version, options, definition] = segments(hash);
  if (version !== HASH_VERSION || !options || !definition) throw new Error('The link has no definition');
  const decodedOptions = decodeOptions(options);
  const decoded = decodeDefinition(definition, createDefinitionSchema(decodedOptions));
  return { options: decodedOptions, presets: decoded.presets, definition: decoded.definition };
}

/**
 * Any playground hash. A version 3 link is decoded with the frozen version 3 schema (loaded only then) and turned
 * into cells; its presets are kept where the number types still exist.
 */
export async function readPlaygroundHash(hash: string): Promise<PlaygroundState & { upgraded: boolean }> {
  if (!isLegacyHash(hash)) return { ...decodePlaygroundHash(hash), upgraded: false };
  const [options, definition] = segments(hash) as [string, string];
  const [{ decodeDefinitionV3 }, { fromV3 }] = await Promise.all([
    import('@dirty-geometry/vec2/schema/dense/v3/decode'),
    import('@dirty-geometry/vec2/recording/migrate'),
  ]);
  const decodedOptions = decodeOptions(options);
  const decoded = decodeDefinitionV3(definition, decodedOptions);
  return { options: decodedOptions, presets: decoded.presets, definition: fromV3(decoded.definition), upgraded: true };
}
