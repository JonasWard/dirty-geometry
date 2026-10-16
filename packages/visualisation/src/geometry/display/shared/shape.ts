import { Shape, ShapeGeometry } from 'three';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';

export function shapeGeometryFromPoints(points: readonly Vec2[]): ShapeGeometry | null {
  if (points.length < 3) return null;

  const shape = new Shape();
  shape.moveTo(points[0]!.x, points[0]!.y);

  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i]!.x, points[i]!.y);
  }

  shape.closePath();
  return new ShapeGeometry(shape);
}
