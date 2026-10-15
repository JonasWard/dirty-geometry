import type { Aabb2 } from '../bounds/aabb2';
import type { Vec2 } from '../core/vec2';
import type { Polyline2 } from './curves/polyline2';
import type { Hesse2 } from './primitives/hesse2';
import type { InfiniteLine2 } from './primitives/infinite-line2';
import type { Line2 } from './primitives/line2';
import type { Ray2 } from './primitives/ray2';
import type { Circle2 } from './regions/circle2';
import type { Polygon2 } from './regions/polygon2';
import type { TriMesh2 } from './regions/tri-mesh2';

/** Bounded interiors with signed distance. */
export type Region2 = Circle2 | Polygon2 | TriMesh2;

/** Contains2 container: a region, axis-aligned box, or half-plane. */
export type Container2 = Region2 | Aabb2 | InfiniteLine2;

/** Line-like geometries. */
export type LineLike2 = Hesse2 | InfiniteLine2 | Ray2 | Line2;

/** Contains2 guest geometry. Axis-aligned boxes are tested via `Contains2.aabbIn`. */
export type Geometry2 = Vec2 | LineLike2 | Polyline2 | Polygon2 | Circle2 | TriMesh2 | Aabb2;

/** Result of intersecting two line-likes: an overlapping line-like, a crossing point, or nothing. */
export type LineLike2IntersectionResult = LineLike2 | Vec2 | null;

/** Type tag of any {@link Geometry2}. */
export type GeometryType = Geometry2['type'];

/** The geometry class whose tag is `K`. */
export type GeometryOfType<K extends GeometryType> = Extract<Geometry2, { type: K }>;

export const LINE_LIKE_TYPES: ReadonlySet<GeometryType> = new Set(['Hesse2', 'InfiniteLine2', 'Ray2', 'Line2']);
export const REGION_TYPES: ReadonlySet<GeometryType> = new Set(['Circle2', 'Polygon2', 'TriMesh2']);
export const CONTAINER_TYPES: ReadonlySet<GeometryType> = new Set([...REGION_TYPES, 'Aabb2', 'InfiniteLine2']);
export const GEOMETRY_TYPES: ReadonlySet<GeometryType> = new Set([...LINE_LIKE_TYPES, ...CONTAINER_TYPES, 'Vec2', 'Polyline2']);

export function isLineLike2(geometry: Geometry2): geometry is LineLike2 {
  return LINE_LIKE_TYPES.has(geometry.type);
}

export function isRegion2(geometry: Geometry2): geometry is Region2 {
  return REGION_TYPES.has(geometry.type);
}

export function isContainer2(geometry: Geometry2): geometry is Container2 {
  return CONTAINER_TYPES.has(geometry.type);
}

/**
 * True for geometry instances. A plain JSON object with a geometry `type` is not one: it must also
 * carry the class methods (checked via `toJson`).
 */
export function isGeometry2(value: unknown): value is Geometry2 {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; toJson?: unknown };
  return GEOMETRY_TYPES.has(candidate.type as GeometryType) && typeof candidate.toJson === 'function';
}
