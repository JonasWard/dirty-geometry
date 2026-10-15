import type { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';

/** CCW boundary samples for rendering; includes the closing point at index `segments`. */
export function circleDisplayPoints(circle: Circle2, segments = 24): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(circle.evaluate((i / segments) * Math.PI * 2));
  }
  return points;
}
