export {
  fitGeometriesToFrame,
  frameAnchorPoints,
  geometryFramePoints,
  aabbFrameClippedCorners,
  finiteDisplayAabb,
} from './frame/geometryFrame';
export { INFINITE_DISPLAY_SCALE, type GeometryFrameOptions } from './frame/constants';
export { halfPlaneFrameClippedPolygon } from './display/shared/line-like';

export { GeometryRender } from './components/GeometryRender';
export { ContainerInteriorMesh } from './components/ContainerInteriorMesh';
export { createGeometryOutline, OUTLINE_CREATORS } from './display/outline';
export { createContainerFill, FILL_CREATORS } from './display/interior';
export {
  GEOMETRY_KIND,
  GEOMETRY_OUTLINE_THREE_KIND,
  CONTAINER_FILL_THREE_KIND,
  geometryKindOf,
  geometryKindOf as geometryKind,
  containerKindOf,
  type GeometryKind,
  type OutlineDisplay,
  type FillDisplay,
} from './display/types';

import type { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { createAabb2Outline } from './display/outline/aabb2';

/** Green Aabb2 overlay points for the Aabb2 demo. */
export function aabbDisplayOutlinePoints(
  box: Aabb2,
  fit: (point: Vec2) => Vec2,
  offset: Vec2,
): [number, number, number][] {
  return createAabb2Outline(box, { fit, offset })?.points ?? [];
}
