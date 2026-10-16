import type { BufferGeometry, ShapeGeometry } from 'three';
import type { Container2, Geometry2, GeometryOfType, GeometryType } from '@dirty-geometry/vec2/geometry/kinds';
import type { GeometryDisplayContext } from './context';

/** Geometry kinds are the vec2 type tags. */
export type GeometryKind = GeometryType;

/** Maps each geometry kind to its Three.js outline primitive. */
export const GEOMETRY_OUTLINE_THREE_KIND = {
  Vec2: 'point',
  Line2: 'segment',
  Ray2: 'segment',
  InfiniteLine2: 'segment',
  Hesse2: 'segment',
  Polyline2: 'polyline',
  Polygon2: 'polyline',
  Circle2: 'polyline',
  Aabb2: 'polyline',
  TriMesh2: 'segment-list',
} as const satisfies Record<GeometryKind, string>;

export type GeometryOutlineThreeKind = (typeof GEOMETRY_OUTLINE_THREE_KIND)[GeometryKind];

/** Maps container kinds that support interior fill to Three.js fill primitives. */
export const CONTAINER_FILL_THREE_KIND = {
  Circle2: 'shape',
  Polygon2: 'shape',
  InfiniteLine2: 'shape',
  Aabb2: 'shape',
  TriMesh2: 'buffer',
} as const satisfies Record<Container2['type'], string>;

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
  | PointOutlineDisplay
  | SegmentOutlineDisplay
  | PolylineOutlineDisplay
  | SegmentListOutlineDisplay;

export type ShapeFillDisplay = {
  threeKind: typeof CONTAINER_FILL_THREE_KIND.Circle2;
  geometry: ShapeGeometry;
};

export type BufferFillDisplay = {
  threeKind: typeof CONTAINER_FILL_THREE_KIND.TriMesh2;
  geometry: BufferGeometry;
};

export type FillDisplay = ShapeFillDisplay | BufferFillDisplay;

export type GeometryByKind = { [K in GeometryKind]: GeometryOfType<K> };

export type ContainerByKind = { [K in ContainerKind]: Extract<Container2, { readonly type: K }> };

export type OutlineCreator<K extends GeometryKind = GeometryKind> = (
  geometry: GeometryByKind[K],
  ctx: GeometryDisplayContext,
) => OutlineDisplay | null;

export type FillCreator<K extends ContainerKind = ContainerKind> = (
  container: ContainerByKind[K],
  ctx: GeometryDisplayContext,
) => FillDisplay | null;

export function geometryKindOf(geometry: Geometry2): GeometryKind {
  return geometry.type;
}

export function containerKindOf(container: Container2): ContainerKind {
  return container.type;
}
