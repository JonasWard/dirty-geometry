import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_KIND, type OutlineDisplay } from '../types';
import { createAabb2Outline } from './aabb2';
import { createCircle2Outline } from './circle2';
import { createInfiniteLine2Outline } from './infinite-line2';
import { createLine2Outline } from './line2';
import { createPolygon2Outline } from './polygon2';
import { createPolyline2Outline } from './polyline2';
import { createRay2Outline } from './ray2';
import { createTriMesh2Outline } from './tri-mesh2';
import { createVec2Outline } from './vec2';

export const OUTLINE_CREATORS = {
  [GEOMETRY_KIND.Vec2]: createVec2Outline,
  [GEOMETRY_KIND.Line2]: createLine2Outline,
  [GEOMETRY_KIND.Ray2]: createRay2Outline,
  [GEOMETRY_KIND.InfiniteLine2]: createInfiniteLine2Outline,
  [GEOMETRY_KIND.Polyline2]: createPolyline2Outline,
  [GEOMETRY_KIND.Polygon2]: createPolygon2Outline,
  [GEOMETRY_KIND.Circle2]: createCircle2Outline,
  [GEOMETRY_KIND.Aabb2]: createAabb2Outline,
  [GEOMETRY_KIND.TriMesh2]: createTriMesh2Outline,
} as const;

export function createGeometryOutline(geometry: Geometry2, ctx: GeometryDisplayContext): OutlineDisplay | null {
  if (geometry instanceof Vec2) return createVec2Outline(geometry, ctx);
  if (geometry instanceof Line2) return createLine2Outline(geometry, ctx);
  if (geometry instanceof Ray2) return createRay2Outline(geometry, ctx);
  if (geometry instanceof InfiniteLine2) return createInfiniteLine2Outline(geometry, ctx);
  if (geometry instanceof Polyline2) return createPolyline2Outline(geometry, ctx);
  if (geometry instanceof Polygon2) return createPolygon2Outline(geometry, ctx);
  if (geometry instanceof Circle2) return createCircle2Outline(geometry, ctx);
  if (geometry instanceof Aabb2) return createAabb2Outline(geometry, ctx);
  if (geometry instanceof TriMesh2) return createTriMesh2Outline(geometry, ctx);

  return null;
}
