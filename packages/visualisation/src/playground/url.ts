/**
 * The playground URL: `#/<app>` for the editor, `#/<app>/<view>` for the View tab. Both parts are densing strings;
 * the app state carries the custom number ranges it needs, and the large definition schema is rebuilt from them, so
 * it never travels in the URL.
 */
import { array, densing, enumArray, enumeration, int, object, optional, schema, undensing } from 'densing';
import type { Definition, Input } from '@dirty-geometry/vec2/recording/definition';
import { NUMBER_TYPES } from '@dirty-geometry/vec2/schema/schema';
import {
  createDefinitionSchema,
  decodeDefinition,
  decodeInputValues,
  encodeDefinition,
  encodeInputValues,
} from '@dirty-geometry/vec2/schema/dense/definition';
import type { NumericPreset as CustomPreset } from 'densing';
import type { ActivePresets, NumericOptions } from '@dirty-geometry/vec2/schema/dense/definition';
import { choosePresets } from './presets';

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

const hasCustomRanges = (options: NumericOptions) =>
  Object.values(options.custom ?? {}).some((ranges) => Object.keys(ranges).length > 0);

/**
 * The app state: the definition as a densing string, after its custom number ranges (`<options>.<definition>`)
 * when it has any. `.` is outside densing's alphabet, so the two never mix.
 */
export function encodeAppState(state: PlaygroundState): string {
  const definition = encodeDefinition(state.definition, state.presets, createDefinitionSchema(state.options));
  return hasCustomRanges(state.options) ? `${encodeOptions(state.options)}.${definition}` : definition;
}

/** An app state written by `encodeAppState`; throws when the text is not one. */
export function decodeAppState(text: string): PlaygroundState {
  const parts = text.split('.');
  if (parts.length > 2 || !parts.at(-1)) throw new Error('The link has no definition');
  const options = parts.length === 2 ? decodeOptions(parts[0]!) : {};
  const decoded = decodeDefinition(parts.at(-1)!, createDefinitionSchema(options));
  return { options, presets: decoded.presets, definition: decoded.definition };
}

/**
 * The view state: every input's value alone, in the definition's input order (names and types come from the app
 * state). Numbers are packed with the cheapest exact ranges for them (stored in the string), so a value may leave
 * the range the definition itself was packed with.
 */
export function encodeViewState(options: NumericOptions, inputs: readonly Input[]): string {
  const schema = createDefinitionSchema(options);
  const inputsOnly: Definition = {
    format: 'vec2-definition',
    version: 4,
    inputs: [...inputs],
    functions: [],
    cells: [],
  };
  return encodeInputValues(inputs, choosePresets(inputsOnly, {}, schema), options);
}

/** The values written by `encodeViewState` for `inputs` (the definition's), by input name. */
export function decodeViewState(
  text: string,
  options: NumericOptions,
  inputs: readonly Input[],
): Record<string, Input> {
  const values = decodeInputValues(
    text,
    inputs.map((input) => input.type),
    options,
  );
  return Object.fromEntries(inputs.map((input, i) => [input.name, { ...input, value: values[i]! }]));
}

// ---- the page's hash ----

/**
 * `#/<app>` opens the editor, `#/<app>/<view>` the View tab with those input values; either may end with
 * `/<layout>`, the node view's positions (`#/<app>//<layout>` for the editor). Links without a layout read as before.
 */
export function parseHash(hash: string): { app: string; view?: string; layout?: string } {
  const [app = '', view, layout] = hash.replace(/^#?\/?/, '').split('/');
  return { app, ...(view && { view }), ...(layout && { layout }) };
}

export const formatHash = (app: string, view?: string, layout?: string) =>
  `#/${app}${layout ? `/${view ?? ''}/${layout}` : view ? `/${view}` : ''}`;
