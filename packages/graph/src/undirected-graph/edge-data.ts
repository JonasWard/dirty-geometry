/** Plain JSON (no class instances). */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

/** Serialised edge payload. */
export type EdgeDataJson = { readonly [key: string]: JsonValue };

/**
 * How a graph validates, writes and reads its edge payloads. The default {@link jsonEdgeData} accepts
 * plain JSON records; `undirected-graph/geometry-edge-data` adds vec2 geometry values.
 */
export type EdgeDataCodec<T extends object> = {
  /** Checked when an edge is added. */
  isValid(data: unknown): data is T;
  toJson(data: T): EdgeDataJson;
  fromJson(json: EdgeDataJson): T;
};

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return true;
  if (kind === 'number') return Number.isFinite(value as number);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (kind === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

/** A plain JSON object (not an array, not a class instance). */
export function isJsonRecord(value: unknown): value is EdgeDataJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && isJsonValue(value);
}

/** Plain JSON record payloads, stored and serialised as they are. */
export function jsonEdgeData<T extends object>(): EdgeDataCodec<T> {
  return {
    isValid: (data: unknown): data is T => isJsonRecord(data),
    toJson: (data) => data as EdgeDataJson,
    fromJson: (json) => json as T,
  };
}
