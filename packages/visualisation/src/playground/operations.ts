/**
 * The hardcoded operations the builder offers first (every recordable operation stays reachable), by select key:
 * `Class.member()` for instance members, `Class.member` for statics and constructors, helpers by name.
 */
export const OPERATION_GROUPS: readonly { label: string; ops: readonly string[] }[] = [
  {
    label: 'Points',
    ops: [
      'Vec2.new',
      'Vec2.add()',
      'Vec2.subtract()',
      'Vec2.scale()',
      'Vec2.unit()',
      'Vec2.perpendicular()',
      'Vec2.center',
      'Vec2.distance()',
      'Vec2.transform()',
    ],
  },
  {
    label: 'Lines',
    ops: [
      'Line2.new',
      'Line2.evaluate()',
      'Line2.length()',
      'Line2.closestPointForPoint()',
      'Ray2.new',
      'InfiniteLine2.new',
      'Intersection2.lines',
    ],
  },
  {
    label: 'Curves',
    ops: [
      'Polyline2.new',
      'Polyline2.evaluate()',
      'Polyline2.evaluateAtLength()',
      'Polyline2.length()',
      'DouglasPeucker.simplify',
    ],
  },
  {
    label: 'Regions',
    ops: [
      'Polygon2.new',
      'Polygon2.fromAabb2',
      'Polygon2.area()',
      'Polygon2.segments()',
      'Polygon2.evaluate()',
      'Circle2.new',
      'Circle2.evaluate()',
      'Circle2.area()',
      'Aabb2.fromPoints',
    ],
  },
  { label: 'Booleans', ops: ['Boolean2.union', 'Boolean2.subtract', 'Boolean2.intersect'] },
  { label: 'Mesh', ops: ['ConstrainedDelaunay.triangulate', 'convexHullLoop'] },
  { label: 'Transforms', ops: ['Mat3.translation', 'Mat3.rotation', 'Mat3.scale'] },
];

/** Short label of an operation key: `Vec2.new` → `new Vec2`, others as they are. */
export const operationLabel = (key: string) => (key.endsWith('.new') ? `new ${key.slice(0, -4)}` : key);
