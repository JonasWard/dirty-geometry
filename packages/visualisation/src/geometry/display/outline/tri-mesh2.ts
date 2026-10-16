import type { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import { fittedLinePoints } from '../shared/polyline';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type SegmentListOutlineDisplay } from '../types';

export function createTriMesh2Outline(
  geometry: TriMesh2,
  ctx: GeometryDisplayContext,
): SegmentListOutlineDisplay | null {
  const segments = geometry
    .uniqueEdges()
    .map((edge) => {
      const points = fittedLinePoints(ctx.fit, edge.from, edge.to, ctx.offset);
      return points.length === 2 ? ([points[0]!, points[1]!] as const) : null;
    })
    .filter((segment): segment is SegmentListOutlineDisplay['segments'][number] => segment !== null);

  if (segments.length === 0) return null;

  return {
    threeKind: GEOMETRY_OUTLINE_THREE_KIND.TriMesh2,
    segments: [...segments],
  };
}
