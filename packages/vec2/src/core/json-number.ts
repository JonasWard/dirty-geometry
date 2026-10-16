/** A number as stored in JSON: `JSON.stringify` turns ±Infinity into `null`, so they become strings. */
export type JsonNumber = number | 'Infinity' | '-Infinity';

export function encodeJsonNumber(value: number): JsonNumber {
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return value;
}

/** Decode a {@link JsonNumber}; `undefined` when `value` is not one. */
export function decodeJsonNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value === 'Infinity') return Infinity;
  if (value === '-Infinity') return -Infinity;
  return undefined;
}
