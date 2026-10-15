import type { Container2 } from '@dirty-geometry/vec2/geometry/kinds';
import type { GeometryDisplayContext } from '../context';
import { dispatchByType, type DispatchTable } from '../dispatch';
import type { FillDisplay } from '../types';
import { createAabb2Fill } from './aabb2';
import { createCircle2Fill } from './circle2';
import { createInfiniteLine2Fill } from './infinite-line2';
import { createPolygon2Fill } from './polygon2';
import { createTriMesh2Fill } from './tri-mesh2';

export const FILL_CREATORS = {
  Circle2: createCircle2Fill,
  Polygon2: createPolygon2Fill,
  InfiniteLine2: createInfiniteLine2Fill,
  Aabb2: createAabb2Fill,
  TriMesh2: createTriMesh2Fill,
} satisfies DispatchTable<Container2, [GeometryDisplayContext], FillDisplay | null>;

export function createContainerFill(container: Container2, ctx: GeometryDisplayContext): FillDisplay | null {
  return dispatchByType<Container2, [GeometryDisplayContext], FillDisplay | null>(FILL_CREATORS, container, ctx);
}
