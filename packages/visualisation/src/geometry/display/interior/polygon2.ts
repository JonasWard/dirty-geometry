import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { shapeGeometryFromPoints } from '../shared/shape';
import type { GeometryDisplayContext } from '../context';
import { CONTAINER_FILL_THREE_KIND, type ShapeFillDisplay } from '../types';

const MIN_FILL_AREA = 1e-12;

export function createPolygon2Fill(geometry: Polygon2, ctx: GeometryDisplayContext): ShapeFillDisplay | null {
  // Zero-width virtual footprints collapse to the axis — skip empty fills.
  if (Math.abs(Polygon2.computeSignedArea(geometry.vertices)) < MIN_FILL_AREA) return null;

  const geometry3 = shapeGeometryFromPoints(geometry.vertices.map(ctx.fit));
  if (!geometry3) return null;

  return {
    threeKind: CONTAINER_FILL_THREE_KIND.Polygon2,
    geometry: geometry3,
  };
}
