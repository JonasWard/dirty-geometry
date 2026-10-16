import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import type { GeometryDisplayContext } from '../context';
import { dispatchByType, type DispatchTable } from '../dispatch';
import type { OutlineDisplay } from '../types';
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
  Vec2: createVec2Outline,
  Line2: createLine2Outline,
  Ray2: createRay2Outline,
  InfiniteLine2: createInfiniteLine2Outline,
  Hesse2: (hesse, ctx) => createInfiniteLine2Outline(hesse.infiniteLine(), ctx),
  Polyline2: createPolyline2Outline,
  Polygon2: createPolygon2Outline,
  Circle2: createCircle2Outline,
  Aabb2: createAabb2Outline,
  TriMesh2: createTriMesh2Outline,
} satisfies DispatchTable<Geometry2, [GeometryDisplayContext], OutlineDisplay | null>;

export function createGeometryOutline(geometry: Geometry2, ctx: GeometryDisplayContext): OutlineDisplay | null {
  return dispatchByType<Geometry2, [GeometryDisplayContext], OutlineDisplay | null>(OUTLINE_CREATORS, geometry, ctx);
}
