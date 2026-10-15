import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import { Deserialise, type MathJson } from '@dirty-geometry/vec2/io/deserialise';

/** Plain JSON (no class instances). */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

/** Allowed value in an edge-data record: JSON, a Geometry2, or a Geometry2 array. */
export type EdgeDataValue = JsonValue | Geometry2 | readonly Geometry2[];

/** Edge payload shape (enforced at runtime via `isEdgeDataRecord`). */
export type EdgeDataRecord = { readonly [key: string]: EdgeDataValue };

export type EdgeDataJson = { readonly [key: string]: JsonValue };

const GEOMETRY_JSON_TYPES = new Set<string>([
  Vec2.type,
  Line2.type,
  Ray2.type,
  InfiniteLine2.type,
  Polyline2.type,
  Polygon2.type,
  Circle2.type,
  TriMesh2.type,
  Aabb2.type,
]);

export function isGeometry2(value: unknown): value is Geometry2 {
  return (
    value instanceof Vec2 ||
    value instanceof Line2 ||
    value instanceof Ray2 ||
    value instanceof InfiniteLine2 ||
    value instanceof Polyline2 ||
    value instanceof Polygon2 ||
    value instanceof Circle2 ||
    value instanceof TriMesh2 ||
    value instanceof Aabb2
  );
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return true;
  if (kind === 'number') return Number.isFinite(value as number);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (kind === 'object') {
    if (isGeometry2(value)) return false;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

function isGeometryJson(value: unknown): value is MathJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string' &&
    GEOMETRY_JSON_TYPES.has((value as { type: string }).type)
  );
}

export function isEdgeDataValue(value: unknown): value is EdgeDataValue {
  if (isGeometry2(value)) return true;
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    if (isGeometry2(value[0])) return value.every(isGeometry2);
    return isJsonValue(value);
  }
  return isJsonValue(value);
}

export function isGeometry2Array(value: unknown): value is readonly Geometry2[] {
  return Array.isArray(value) && (value.length === 0 || value.every(isGeometry2));
}

export function isEdgeDataRecord(value: unknown): value is EdgeDataRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isGeometry2(value)) return false;
  return Object.values(value).every(isEdgeDataValue);
}

export function serialiseEdgeDataValue(value: EdgeDataValue): JsonValue {
  if (isGeometry2(value)) return value.toJson() as JsonValue;
  if (isGeometry2Array(value)) return value.map((geometry) => geometry.toJson() as JsonValue);
  return value;
}

export function serialiseEdgeData(data: EdgeDataRecord): EdgeDataJson {
  const out: { [key: string]: JsonValue } = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = serialiseEdgeDataValue(value);
  }
  return out;
}

export function deserialiseEdgeDataValue(value: unknown): EdgeDataValue {
  if (Array.isArray(value)) {
    if (value.length > 0 && isGeometryJson(value[0])) {
      return value.map((item) => Deserialise.fromJson(item) as Geometry2);
    }
    if (!isJsonValue(value)) throw new Error('Invalid edge-data JSON array');
    return value;
  }
  if (isGeometryJson(value)) return Deserialise.fromJson(value) as Geometry2;
  if (!isJsonValue(value)) throw new Error('Invalid edge-data JSON value');
  return value;
}

export function deserialiseEdgeData(data: unknown): EdgeDataRecord {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Edge data must be a record');
  }
  const out: { [key: string]: EdgeDataValue } = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = deserialiseEdgeDataValue(value);
  }
  return out;
}
