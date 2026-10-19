import { operationById } from '@dirty-geometry/vec2/schema/schema';

/** The favourite operations until the viewer picks their own (the picker lists favourites first). */
export const DEFAULT_FAVOURITES: readonly string[] = [
  'Vec2.new',
  'Vec2.add',
  'Vec2.subtract',
  'Vec2.scale',
  'Vec2.unit',
  'Vec2.perpendicular',
  'Vec2.center',
  'Vec2.distance',
  'Vec2.transform',
  'Line2.new',
  'Line2.evaluate',
  'Line2.length',
  'Line2.closestPointForPoint',
  'Ray2.new',
  'InfiniteLine2.new',
  'Intersection2.lines',
  'Polyline2.new',
  'Polyline2.evaluate',
  'Polyline2.evaluateAtLength',
  'Polyline2.length',
  'DouglasPeucker.simplify',
  'Polygon2.new',
  'Polygon2.fromAabb2',
  'Polygon2.area',
  'Polygon2.segments',
  'Polygon2.evaluate',
  'Circle2.new',
  'Circle2.evaluate',
  'Circle2.area',
  'Aabb2.fromPoints',
  'Boolean2.union',
  'Boolean2.subtract',
  'Boolean2.intersect',
  'ConstrainedDelaunay.triangulate',
  'helpers.convexHullLoop',
  'Mat3.translation',
  'Mat3.rotation',
  'Mat3.scale',
];

/** How an operation reads in code: `new Vec2`, `Vec2.center`, `.add` (on a Vec2), `convexHullLoop`. */
export function operationLabel(id: string): { head: string; owner?: string } {
  const op = operationById.get(id);
  const [owner, member] = id.split('.') as [string, string];
  if (owner === 'helpers') return { head: member };
  if (member === 'new') return { head: `new ${owner}` };
  return op && !op.static ? { head: `.${member}${op.value ? '' : '()'}`, owner } : { head: `${owner}.${member}` };
}
