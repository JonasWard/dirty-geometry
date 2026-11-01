import type { ArcPolyline2 } from '@dirty-geometry/vec2/geometry/curves/arc-polyline2';
import type { Arc2 } from '@dirty-geometry/vec2/geometry/primitives/arc2';
import type { ArcPolygon2 } from '@dirty-geometry/vec2/geometry/regions/arc-polygon2';
import { arcChainDisplayPoints, displayChordTolerance } from '../shared/arc';
import { fittedPolylinePoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type PolylineOutlineDisplay } from '../types';

function chainOutline(
  segments: Parameters<typeof arcChainDisplayPoints>[0],
  closed: boolean,
  ctx: GeometryDisplayContext,
): PolylineOutlineDisplay | null {
  // The sampled closed chain already ends on its first point, so it is drawn as an open polyline.
  const sampled = arcChainDisplayPoints(segments, closed, displayChordTolerance(ctx.fit));
  const points = fittedPolylinePoints(ctx.fit, sampled, false, ctx.offset);
  if (points.length < 2) return null;
  return { threeKind: GEOMETRY_OUTLINE_THREE_KIND.Polyline2, points, closed: false };
}

export function createArc2Outline(geometry: Arc2, ctx: GeometryDisplayContext): PolylineOutlineDisplay | null {
  return chainOutline([geometry], false, ctx);
}

export function createArcPolyline2Outline(
  geometry: ArcPolyline2,
  ctx: GeometryDisplayContext,
): PolylineOutlineDisplay | null {
  return chainOutline(geometry.segments(), false, ctx);
}

export function createArcPolygon2Outline(
  geometry: ArcPolygon2,
  ctx: GeometryDisplayContext,
): PolylineOutlineDisplay | null {
  return chainOutline(geometry.segments(), true, ctx);
}
