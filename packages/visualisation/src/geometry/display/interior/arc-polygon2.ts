import type { ArcPolygon2 } from '@dirty-geometry/vec2/geometry/regions/arc-polygon2';
import { arcChainDisplayPoints, displayChordTolerance } from '../shared/arc';
import { shapeGeometryFromPoints } from '../shared/shape';
import type { GeometryDisplayContext } from '../context';
import { CONTAINER_FILL_THREE_KIND, type ShapeFillDisplay } from '../types';

const MIN_FILL_AREA = 1e-12;

export function createArcPolygon2Fill(geometry: ArcPolygon2, ctx: GeometryDisplayContext): ShapeFillDisplay | null {
  if (geometry.area() < MIN_FILL_AREA) return null;

  const points = arcChainDisplayPoints(geometry.segments(), true, displayChordTolerance(ctx.fit)).slice(0, -1);
  const geometry3 = shapeGeometryFromPoints(points.map(ctx.fit));
  if (!geometry3) return null;

  return { threeKind: CONTAINER_FILL_THREE_KIND.ArcPolygon2, geometry: geometry3 };
}
