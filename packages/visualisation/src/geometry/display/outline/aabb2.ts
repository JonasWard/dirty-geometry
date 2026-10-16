import type { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { aabbFrameClippedCorners } from '../../frame/geometryFrame';
import { fittedPolylinePoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type PolylineOutlineDisplay } from '../types';

export function createAabb2Outline(geometry: Aabb2, ctx: GeometryDisplayContext): PolylineOutlineDisplay | null {
  const corners = aabbFrameClippedCorners(ctx.fit, geometry);
  if (corners.length === 0) return null;

  const points = fittedPolylinePoints((point) => point, corners, true, ctx.offset);
  if (points.length < 2) return null;

  return {
    threeKind: GEOMETRY_OUTLINE_THREE_KIND.Aabb2,
    points,
    closed: true,
  };
}
