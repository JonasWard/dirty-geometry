import type { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { circleDisplayPoints } from '../shared/circle';
import { fittedPolylinePoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type PolylineOutlineDisplay } from '../types';

export function createCircle2Outline(geometry: Circle2, ctx: GeometryDisplayContext): PolylineOutlineDisplay | null {
  const points = fittedPolylinePoints(ctx.fit, circleDisplayPoints(geometry), true, ctx.offset);
  if (points.length < 2) return null;

  return {
    threeKind: GEOMETRY_OUTLINE_THREE_KIND.Circle2,
    points,
    closed: true,
  };
}
