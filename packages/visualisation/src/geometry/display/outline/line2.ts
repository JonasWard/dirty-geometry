import type { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { fittedDisplayLineLike } from '../shared/line-like';
import { fittedSegmentPoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type SegmentOutlineDisplay } from '../types';

export function createLine2Outline(geometry: Line2, ctx: GeometryDisplayContext): SegmentOutlineDisplay | null {
  const segment = fittedDisplayLineLike(geometry, ctx);
  if (!segment) return null;

  const points = fittedSegmentPoints(segment.from, segment.to, ctx.offset);
  if (points.length !== 2) return null;

  return {
    threeKind: GEOMETRY_OUTLINE_THREE_KIND.Line2,
    points: [points[0]!, points[1]!],
  };
}
