import type { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { halfPlaneFrameClippedPolygon } from '../shared/line-like';
import { shapeGeometryFromPoints } from '../shared/shape';
import type { GeometryDisplayContext } from '../context';
import { CONTAINER_FILL_THREE_KIND, type ShapeFillDisplay } from '../types';

export function createInfiniteLine2Fill(geometry: InfiniteLine2, ctx: GeometryDisplayContext): ShapeFillDisplay | null {
  const geometry3 = shapeGeometryFromPoints(halfPlaneFrameClippedPolygon(geometry, ctx.fit));
  if (!geometry3) return null;

  return {
    threeKind: CONTAINER_FILL_THREE_KIND.InfiniteLine2,
    geometry: geometry3,
  };
}
