import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { fittedPolylinePoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type PolylineOutlineDisplay } from '../types';

const MIN_OUTLINE_AREA = 1e-12;

export function createPolygon2Outline(geometry: Polygon2, ctx: GeometryDisplayContext): PolylineOutlineDisplay | null {
  // Degenerate (zero-width virtual) footprints are drawn via their axis instead.
  if (Math.abs(Polygon2.computeSignedArea(geometry.vertices)) < MIN_OUTLINE_AREA) return null;

  const points = fittedPolylinePoints(ctx.fit, geometry.vertices, true, ctx.offset);
  if (points.length < 2) return null;

  return {
    threeKind: GEOMETRY_OUTLINE_THREE_KIND.Polygon2,
    points,
    closed: true,
  };
}
