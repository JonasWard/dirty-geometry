/** Shape checks for the JSON written by each type's `toJson`. */
import { Aabb2, type Aabb2Json } from '../bounds/aabb2';
import { Interval2, type Interval2Json } from '../bounds/interval2';
import { Angle, type AngleJson } from '../core/angle';
import { Mat3, type Mat3Json } from '../core/mat3';
import { Vec2, type Vec2Json } from '../core/vec2';
import { Polyline2, type Polyline2Json } from '../geometry/curves/polyline2';
import { InfiniteLine2, type InfiniteLine2Json } from '../geometry/primitives/infinite-line2';
import { Hesse2, type Hesse2Json } from '../geometry/primitives/hesse2';
import { Line2, type Line2Json } from '../geometry/primitives/line2';
import { Ray2, type Ray2Json } from '../geometry/primitives/ray2';
import { Circle2, type Circle2Json } from '../geometry/regions/circle2';
import { Polygon2, type Polygon2Json } from '../geometry/regions/polygon2';
import { TriMesh2, type TriMesh2Json } from '../geometry/regions/tri-mesh2';
import { Frame2, type Frame2Json } from '../core/frame2';
import { GridCell2, type GridCell2Json } from '../grid/core/grid-cell2';
import { Axis, type AxisJson } from '../grid/core/grid-axis';
import { Grid2, type Grid2Json } from '../grid/core/grid2';
import { GridLine2, type GridLine2Json } from '../grid/regions/grid-line2';
import { GridPolyline2, type GridPolyline2Json } from '../grid/regions/grid-polyline2';
import { GridPolygon2, type GridPolygon2Json } from '../grid/regions/grid-polygon2';
import { GridRectangle2, type GridRectangle2Json } from '../grid/regions/grid-rectangle2';
import { GridCell2Collection, type CellCollectionJson } from '../grid/regions/grid-cell2-collection';
import { Epsilon, type EpsilonJson } from '../core/epsilon';

import { decodeJsonNumber } from '../core/json-number';

export function isVec2Json(data: unknown): data is Vec2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Vec2Json).type === Vec2.type &&
    typeof (data as Vec2Json).x === 'number' &&
    typeof (data as Vec2Json).y === 'number'
  );
}

export function isMat3Json(data: unknown): data is Mat3Json {
  if (typeof data !== 'object' || data === null || (data as Mat3Json).type !== Mat3.type) {
    return false;
  }

  const elements = (data as Mat3Json).elements;
  return Array.isArray(elements) && elements.length === 9 && elements.every((n) => typeof n === 'number');
}

export function isAngleJson(data: unknown): data is AngleJson {
  if (typeof data !== 'object' || data === null || (data as AngleJson).type !== Angle.type) {
    return false;
  }

  const angle = data as AngleJson;
  return (
    typeof angle.value === 'number' &&
    typeof angle.precision === 'number' &&
    (angle.domainKind === 'tau' || angle.domainKind === 'pi')
  );
}

export function isLine2Json(data: unknown): data is Line2Json {
  return typeof data === 'object' && data !== null && (data as Line2Json).type === Line2.type;
}

export function isRay2Json(data: unknown): data is Ray2Json {
  return typeof data === 'object' && data !== null && (data as Ray2Json).type === Ray2.type;
}

export function isInfiniteLine2Json(data: unknown): data is InfiniteLine2Json {
  return typeof data === 'object' && data !== null && (data as InfiniteLine2Json).type === InfiniteLine2.type;
}

export function isHesse2Json(data: unknown): data is Hesse2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Hesse2Json).type === Hesse2.type &&
    typeof (data as Hesse2Json).offset === 'number'
  );
}

export function isPolyline2Json(data: unknown): data is Polyline2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Polyline2Json).type === Polyline2.type &&
    Array.isArray((data as Polyline2Json).vertices)
  );
}

export function isPolygon2Json(data: unknown): data is Polygon2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Polygon2Json).type === Polygon2.type &&
    Array.isArray((data as Polygon2Json).vertices)
  );
}

/** Endpoints are numbers or `"Infinity"` / `"-Infinity"`; `null` (older JSON of an infinite endpoint) is accepted too. */
export function isInterval2Json(data: unknown): data is Interval2Json {
  if (typeof data !== 'object' || data === null || (data as Interval2Json).type !== Interval2.type) {
    return false;
  }
  const { min, max } = data as { min: unknown; max: unknown };
  return (min === null || decodeJsonNumber(min) !== undefined) && (max === null || decodeJsonNumber(max) !== undefined);
}

export function isAabb2Json(data: unknown): data is Aabb2Json {
  if (typeof data !== 'object' || data === null || (data as Aabb2Json).type !== Aabb2.type) {
    return false;
  }

  const box = data as Aabb2Json;
  return isInterval2Json(box.x) && isInterval2Json(box.y);
}

export function isTriangleIndices(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    typeof value[2] === 'number'
  );
}

export function isTriMesh2Json(data: unknown): data is TriMesh2Json {
  if (typeof data !== 'object' || data === null || (data as TriMesh2Json).type !== TriMesh2.type) {
    return false;
  }

  const mesh = data as TriMesh2Json;
  return Array.isArray(mesh.vertices) && Array.isArray(mesh.triangles) && mesh.triangles.every(isTriangleIndices);
}

export function isCircle2Json(data: unknown): data is Circle2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Circle2Json).type === Circle2.type &&
    typeof (data as Circle2Json).radius === 'number'
  );
}

export function isGridCell2Json(data: unknown): data is GridCell2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as GridCell2Json).type === GridCell2.type &&
    typeof (data as GridCell2Json).i === 'number' &&
    typeof (data as GridCell2Json).j === 'number'
  );
}

export function isFrame2Json(data: unknown): data is Frame2Json {
  return typeof data === 'object' && data !== null && (data as Frame2Json).type === Frame2.type;
}

export function isAxisJson(data: unknown): data is AxisJson {
  if (typeof data !== 'object' || data === null || !('kind' in data)) {
    return false;
  }

  const axis = data as AxisJson;
  if (axis.type !== undefined && axis.type !== Axis.type) {
    return false;
  }
  switch (axis.kind) {
    case 'unit':
      return axis.domain === undefined || isInterval2Json(axis.domain);
    case 'uniform':
      return typeof axis.size === 'number' && (axis.domain === undefined || isInterval2Json(axis.domain));
    case 'custom':
      return (
        typeof axis.defaultSize === 'number' &&
        typeof axis.sizes === 'object' &&
        axis.sizes !== null &&
        (axis.domain === undefined || isInterval2Json(axis.domain))
      );
    default:
      return false;
  }
}

export function isGrid2Json(data: unknown): data is Grid2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Grid2Json).type === Grid2.type &&
    typeof (data as Grid2Json).u === 'object' &&
    (data as Grid2Json).u !== null &&
    typeof (data as Grid2Json).v === 'object' &&
    (data as Grid2Json).v !== null
  );
}

export function isGridLine2Json(data: unknown): data is GridLine2Json {
  return typeof data === 'object' && data !== null && (data as GridLine2Json).type === GridLine2.type;
}

export function isGridPolyline2Json(data: unknown): data is GridPolyline2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as GridPolyline2Json).type === GridPolyline2.type &&
    Array.isArray((data as GridPolyline2Json).vertices)
  );
}

export function isGridPolygon2Json(data: unknown): data is GridPolygon2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as GridPolygon2Json).type === GridPolygon2.type &&
    Array.isArray((data as GridPolygon2Json).vertices)
  );
}

export function isGridRectangle2Json(data: unknown): data is GridRectangle2Json {
  return typeof data === 'object' && data !== null && (data as GridRectangle2Json).type === GridRectangle2.type;
}

export function isCellCollectionJson(data: unknown): data is CellCollectionJson {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as CellCollectionJson).type === GridCell2Collection.type &&
    Array.isArray((data as CellCollectionJson).cells)
  );
}

export function isEpsilonJson(data: unknown): data is EpsilonJson {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as EpsilonJson).type === Epsilon.type &&
    typeof (data as EpsilonJson).value === 'number'
  );
}
