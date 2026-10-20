import type { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';

/** CCW boundary samples for rendering; includes the closing point at index `segments`. */
export function circleDisplayPoints(circle: Circle2, segments = 24): Vec2[] {
  const { vertices } = Polygon2.fromCircle2(circle, segments);
  return [...vertices, vertices[0]!];
}
