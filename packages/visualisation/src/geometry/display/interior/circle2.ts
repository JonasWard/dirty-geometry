import type { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { circleDisplayPoints } from '../shared/circle';
import { shapeGeometryFromPoints } from '../shared/shape';
import type { GeometryDisplayContext } from '../context';
import { CONTAINER_FILL_THREE_KIND, type ShapeFillDisplay } from '../types';

export function createCircle2Fill(geometry: Circle2, ctx: GeometryDisplayContext): ShapeFillDisplay | null {
  const geometry3 = shapeGeometryFromPoints(circleDisplayPoints(geometry, 32).map(ctx.fit));
  if (!geometry3) return null;

  return {
    threeKind: CONTAINER_FILL_THREE_KIND.Circle2,
    geometry: geometry3,
  };
}
