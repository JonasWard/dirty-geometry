import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { GeometryDisplayContext } from '../context';
import { GEOMETRY_OUTLINE_THREE_KIND, type PointOutlineDisplay } from '../types';

export function createVec2Outline(_geometry: Vec2, _ctx: GeometryDisplayContext): PointOutlineDisplay {
  return { threeKind: GEOMETRY_OUTLINE_THREE_KIND.Vec2 };
}
