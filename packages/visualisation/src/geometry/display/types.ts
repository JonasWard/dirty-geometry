import type { BufferGeometry, ShapeGeometry } from 'three';
import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import type { Container2, Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import type { GeometryDisplayContext } from './context';

export const GEOMETRY_KIND = {
  Vec2: Vec2.type,
  Line2: Line2.type,
  Ray2: Ray2.type,
  InfiniteLine2: InfiniteLine2.type,
  Polyline2: Polyline2.type,
  Polygon2: Polygon2.type,
  Circle2: Circle2.type,
  TriMesh2: TriMesh2.type,
  Aabb2: Aabb2.type,
} as const;

export type GeometryKind = (typeof GEOMETRY_KIND)[keyof typeof GEOMETRY_KIND];

/** Maps each geometry kind to its Three.js outline primitive. */
export const GEOMETRY_OUTLINE_THREE_KIND = {
  [GEOMETRY_KIND.Vec2]: 'point',
  [GEOMETRY_KIND.Line2]: 'segment',
  [GEOMETRY_KIND.Ray2]: 'segment',
  [GEOMETRY_KIND.InfiniteLine2]: 'segment',
  [GEOMETRY_KIND.Polyline2]: 'polyline',
  [GEOMETRY_KIND.Polygon2]: 'polyline',
  [GEOMETRY_KIND.Circle2]: 'polyline',
  [GEOMETRY_KIND.Aabb2]: 'polyline',
  [GEOMETRY_KIND.TriMesh2]: 'segment-list',
} as const;

export type GeometryOutlineThreeKind = (typeof GEOMETRY_OUTLINE_THREE_KIND)[GeometryKind];

/** Maps container kinds that support interior fill to Three.js fill primitives. */
export const CONTAINER_FILL_THREE_KIND = {
  [GEOMETRY_KIND.Circle2]: 'shape',
  [GEOMETRY_KIND.Polygon2]: 'shape',
  [GEOMETRY_KIND.InfiniteLine2]: 'shape',
  [GEOMETRY_KIND.Aabb2]: 'shape',
  [GEOMETRY_KIND.TriMesh2]: 'buffer',
} as const;

export type ContainerKind = keyof typeof CONTAINER_FILL_THREE_KIND;
export type ContainerFillThreeKind = (typeof CONTAINER_FILL_THREE_KIND)[ContainerKind];

export type Point3 = [number, number, number];
export type Segment3 = [Point3, Point3];

export type PointOutlineDisplay = {
  threeKind: typeof GEOMETRY_OUTLINE_THREE_KIND.Vec2;
};

export type SegmentOutlineDisplay = {
  threeKind: typeof GEOMETRY_OUTLINE_THREE_KIND.Line2;
  points: Segment3;
};

export type PolylineOutlineDisplay = {
  threeKind: typeof GEOMETRY_OUTLINE_THREE_KIND.Polyline2;
  points: Point3[];
  closed: boolean;
};

export type SegmentListOutlineDisplay = {
  threeKind: typeof GEOMETRY_OUTLINE_THREE_KIND.TriMesh2;
  segments: Segment3[];
};

export type OutlineDisplay =
  PointOutlineDisplay | SegmentOutlineDisplay | PolylineOutlineDisplay | SegmentListOutlineDisplay;

export type ShapeFillDisplay = {
  threeKind: typeof CONTAINER_FILL_THREE_KIND.Circle2;
  geometry: ShapeGeometry;
};

export type BufferFillDisplay = {
  threeKind: typeof CONTAINER_FILL_THREE_KIND.TriMesh2;
  geometry: BufferGeometry;
};

export type FillDisplay = ShapeFillDisplay | BufferFillDisplay;

export type GeometryByKind = {
  [GEOMETRY_KIND.Vec2]: Vec2;
  [GEOMETRY_KIND.Line2]: Line2;
  [GEOMETRY_KIND.Ray2]: Ray2;
  [GEOMETRY_KIND.InfiniteLine2]: InfiniteLine2;
  [GEOMETRY_KIND.Polyline2]: Polyline2;
  [GEOMETRY_KIND.Polygon2]: Polygon2;
  [GEOMETRY_KIND.Circle2]: Circle2;
  [GEOMETRY_KIND.TriMesh2]: TriMesh2;
  [GEOMETRY_KIND.Aabb2]: Aabb2;
};

export type ContainerByKind = {
  [GEOMETRY_KIND.Circle2]: Circle2;
  [GEOMETRY_KIND.Polygon2]: Polygon2;
  [GEOMETRY_KIND.InfiniteLine2]: InfiniteLine2;
  [GEOMETRY_KIND.Aabb2]: Aabb2;
  [GEOMETRY_KIND.TriMesh2]: TriMesh2;
};

export type OutlineCreator<K extends GeometryKind = GeometryKind> = (
  geometry: GeometryByKind[K],
  ctx: GeometryDisplayContext,
) => OutlineDisplay | null;

export type FillCreator<K extends ContainerKind = ContainerKind> = (
  container: ContainerByKind[K],
  ctx: GeometryDisplayContext,
) => FillDisplay | null;

export function geometryKindOf(geometry: Geometry2): GeometryKind {
  if (geometry instanceof Vec2) return GEOMETRY_KIND.Vec2;
  if (geometry instanceof Line2) return GEOMETRY_KIND.Line2;
  if (geometry instanceof Ray2) return GEOMETRY_KIND.Ray2;
  if (geometry instanceof InfiniteLine2) return GEOMETRY_KIND.InfiniteLine2;
  if (geometry instanceof Polyline2) return GEOMETRY_KIND.Polyline2;
  if (geometry instanceof Polygon2) return GEOMETRY_KIND.Polygon2;
  if (geometry instanceof Circle2) return GEOMETRY_KIND.Circle2;
  if (geometry instanceof Aabb2) return GEOMETRY_KIND.Aabb2;
  return GEOMETRY_KIND.TriMesh2;
}

export function containerKindOf(container: Container2): ContainerKind {
  const kind = geometryKindOf(container);
  if (!(kind in CONTAINER_FILL_THREE_KIND)) {
    throw new Error(`Container kind ${kind} has no interior fill mapping`);
  }
  return kind as ContainerKind;
}
