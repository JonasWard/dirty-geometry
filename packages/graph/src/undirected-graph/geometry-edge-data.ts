import { isGeometry2, GEOMETRY_TYPES, type Geometry2, type GeometryType } from '@dirty-geometry/vec2/geometry/kinds';
import { Deserialise } from '@dirty-geometry/vec2/io/deserialise';
import { isJsonValue, type EdgeDataCodec, type EdgeDataJson, type JsonValue } from './edge-data';

/** Allowed value in a geometry edge payload: JSON, a Geometry2, or a Geometry2 array. */
export type EdgeDataValue = JsonValue | Geometry2 | readonly Geometry2[];

/** Edge payload shape accepted by {@link geometryEdgeData}. */
export type EdgeDataRecord = { readonly [key: string]: EdgeDataValue };

export function isEdgeDataValue(value: unknown): value is EdgeDataValue {
  if (isGeometry2(value)) return true;
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    if (isGeometry2(value[0])) return value.every(isGeometry2);
    return isJsonValue(value);
  }
  return isJsonValue(value);
}

export function isEdgeDataRecord(value: unknown): value is EdgeDataRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isGeometry2(value)) return false;
  return Object.values(value).every(isEdgeDataValue);
}

/**
 * JSON objects whose `type` is a geometry tag are read back as geometry, so a plain JSON payload
 * value must not use those tags.
 */
function isGeometryJson(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    GEOMETRY_TYPES.has((value as { type?: unknown }).type as GeometryType)
  );
}

function valueToJson(value: EdgeDataValue): JsonValue {
  if (isGeometry2(value)) return value.toJson() as JsonValue;
  if (Array.isArray(value) && value.length > 0 && isGeometry2(value[0])) {
    return (value as unknown as readonly Geometry2[]).map((geometry) => geometry.toJson() as JsonValue);
  }
  return value as JsonValue;
}

function valueFromJson(value: JsonValue): EdgeDataValue {
  if (Array.isArray(value) && value.length > 0 && isGeometryJson(value[0])) {
    return value.map((item) => Deserialise.fromJson(item) as Geometry2);
  }
  if (isGeometryJson(value)) return Deserialise.fromJson(value) as Geometry2;
  return value;
}

/** Edge payloads that may hold vec2 geometry (single values or arrays) next to plain JSON. */
export function geometryEdgeData<T extends object>(): EdgeDataCodec<T> {
  return {
    isValid: (data: unknown): data is T => isEdgeDataRecord(data),
    toJson: (data) =>
      Object.fromEntries(Object.entries(data as EdgeDataRecord).map(([key, value]) => [key, valueToJson(value)])),
    fromJson: (json: EdgeDataJson) =>
      Object.fromEntries(Object.entries(json).map(([key, value]) => [key, valueFromJson(value)])) as T,
  };
}
