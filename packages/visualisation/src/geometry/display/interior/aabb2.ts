import type { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { aabbFrameClippedCorners } from '../../frame/geometryFrame';
import { shapeGeometryFromPoints } from '../shared/shape';
import type { GeometryDisplayContext } from '../context';
import { CONTAINER_FILL_THREE_KIND, type ShapeFillDisplay } from '../types';

export function createAabb2Fill(geometry: Aabb2, ctx: GeometryDisplayContext): ShapeFillDisplay | null {
  const geometry3 = shapeGeometryFromPoints(aabbFrameClippedCorners(ctx.fit, geometry));
  if (!geometry3) return null;

  return {
    threeKind: CONTAINER_FILL_THREE_KIND.Aabb2,
    geometry: geometry3,
  };
}
