import type { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { fittedPolylinePoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type PolylineOutlineDisplay } from '../types';

export function createPolyline2Outline(
  geometry: Polyline2,
  ctx: GeometryDisplayContext,
): PolylineOutlineDisplay | null {
  const points = fittedPolylinePoints(ctx.fit, geometry.vertices, false, ctx.offset);
  if (points.length < 2) return null;

  return {
    threeKind: GEOMETRY_OUTLINE_THREE_KIND.Polyline2,
    points,
    closed: false,
  };
}
