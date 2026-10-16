/** A densing schema for one vec2 value of any type, with the shared numeric presets. */
import { densing, schemaFromJson, undensing, type DenseSchema } from 'densing';
import { defaultRegistry } from '@dirty-geometry/vec2/io/default-registry';
import { createNumerics, type ActivePresets, type NumericOptions } from './numerics';
import { anyValueRef, decodeValueData, encodeValueJson, NumericContext, TemplateTable, type ValueType } from './values';

export type DenseValueSchema = { schema: DenseSchema; options: NumericOptions };

export function createValueSchema(options: NumericOptions = {}): DenseValueSchema {
  const table = new TemplateTable();
  const field = anyValueRef(table, 'value');
  const schema = schemaFromJson({ definitions: createNumerics(options), templates: table.templates, fields: [field] });
  return { schema, options };
}

/** Densing data for `value` (anything with `toJson()`, or codec JSON), snapped to the active presets. */
export function valueToDenseData(
  schema: DenseValueSchema,
  value: { toJson(): unknown } | Record<string, unknown>,
  presets: ActivePresets = {},
): Record<string, unknown> {
  const json = (
    typeof (value as { toJson?: unknown }).toJson === 'function' ? (value as { toJson(): unknown }).toJson() : value
  ) as Record<string, any>;
  const ctx = new NumericContext(schema.schema.definitions ?? [], presets);
  return { $presets: { ...presets }, value: { type: json.type, value: encodeValueJson(json, ctx) } };
}

/** Encode one vec2 value as a densing string. */
export function encodeValue(
  schema: DenseValueSchema,
  value: { toJson(): unknown } | Record<string, unknown>,
  presets: ActivePresets = {},
): string {
  return densing(schema.schema, valueToDenseData(schema, value, presets));
}

/** Decode a densing string back to codec JSON, and (with `decode: true`) to the vec2 value. */
export function decodeValueJson(schema: DenseValueSchema, text: string): Record<string, unknown> {
  const data = undensing(schema.schema, text) as {
    $presets?: ActivePresets;
    value: { type: ValueType; value: Record<string, unknown> };
  };
  const ctx = new NumericContext(schema.schema.definitions ?? [], data.$presets ?? {});
  return decodeValueData(data.value.type, data.value.value, ctx);
}

export function decodeValue<T = unknown>(schema: DenseValueSchema, text: string): T {
  return defaultRegistry.decode(decodeValueJson(schema, text)) as T;
}
