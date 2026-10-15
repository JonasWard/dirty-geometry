import type { Container2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_KIND, type FillDisplay } from '../types';
import { createAabb2Fill } from './aabb2';
import { createCircle2Fill } from './circle2';
import { createInfiniteLine2Fill } from './infinite-line2';
import { createPolygon2Fill } from './polygon2';
import { createTriMesh2Fill } from './tri-mesh2';

export const FILL_CREATORS = {
  [GEOMETRY_KIND.Circle2]: createCircle2Fill,
  [GEOMETRY_KIND.Polygon2]: createPolygon2Fill,
  [GEOMETRY_KIND.InfiniteLine2]: createInfiniteLine2Fill,
  [GEOMETRY_KIND.Aabb2]: createAabb2Fill,
  [GEOMETRY_KIND.TriMesh2]: createTriMesh2Fill,
} as const;

export function createContainerFill(container: Container2, ctx: GeometryDisplayContext): FillDisplay | null {
  if (container instanceof Circle2) return createCircle2Fill(container, ctx);
  if (container instanceof Polygon2) return createPolygon2Fill(container, ctx);
  if (container instanceof InfiniteLine2) return createInfiniteLine2Fill(container, ctx);
  if (container instanceof Aabb2) return createAabb2Fill(container, ctx);
  if (container instanceof TriMesh2) return createTriMesh2Fill(container, ctx);
  return null;
}
