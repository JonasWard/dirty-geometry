import { Vec2 } from '../../src/core/vec2';
import { ArcPolyline2 } from '../../src/geometry/curves/arc-polyline2';
import { Arc2 } from '../../src/geometry/primitives/arc2';
import { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { roundedRectangle } from '../arc-shapes';

export type ArcGeometry = Arc2 | ArcPolyline2 | ArcPolygon2;

export type ArcScenario = {
  name: string;
  build: () => ArcGeometry;
  /** Offsets drawn alongside the curve (left positive). */
  offsets?: number[];
  miterLimit?: number;
  /** Samples along the curve by arc length. */
  lengthSamples?: number[];
  /** Closest-point query, with side (curves) or containment (regions). */
  query?: Vec2;
  /** Construction lines drawn faintly behind the curve (for example the corner a fillet rounds). */
  guides?: Vec2[][];
};

const V = (x: number, y: number) => new Vec2(x, y);

export const arcScenarios: ArcScenario[] = [
  {
    name: 'Minor arc (bulges left)',
    build: () => new Arc2(V(0, 0), V(4, 0), 1),
    lengthSamples: [1, 2.3],
    query: V(2, 3),
  },
  { name: 'Half circle (bulges right)', build: () => new Arc2(V(0, 0), V(4, 0), -2), query: V(2, 0.5) },
  { name: 'Major arc', build: () => new Arc2(V(0, 0), V(2, 0), 3), offsets: [0.4], query: V(1, -1) },
  { name: 'Through three points', build: () => Arc2.fromThreePoints(V(0, 0), V(1, 2), V(4, 1)), query: V(3, 3) },
  {
    name: 'Fillet of a corner',
    build: () => Arc2.fromFillet(V(0, 0), V(4, 0), V(4, 4), 1.5),
    guides: [[V(0, 0), V(4, 0), V(4, 4)]],
    query: V(4, 0),
  },
];

export const arcPolylineScenarios: ArcScenario[] = [
  {
    name: 'Wall: straight into an arc',
    build: () => new ArcPolyline2([V(0, 0), V(3, 0), V(5, 2)], [0, -(2 - Math.SQRT2)]),
    offsets: [0.4, -0.4],
    lengthSamples: [1.5, 3, 4.5],
    query: V(4, 0),
  },
  {
    name: 'L corner, mitred',
    build: () => new ArcPolyline2([V(0, 0), V(4, 0), V(4, 4)], [0, 0]),
    offsets: [0.5, -0.5],
    query: V(5, -1),
  },
  {
    name: 'Sharp corner past the miter limit',
    build: () => new ArcPolyline2([V(0, 0), V(4, 0), V(0.5, 1.5)], [0, 0]),
    offsets: [-0.4],
    miterLimit: 2,
  },
  {
    name: 'S-curve of two arcs',
    build: () => new ArcPolyline2([V(0, 0), V(2, 0), V(4, 0)], [1, -1]),
    offsets: [0.3, -0.3],
    query: V(3, 1),
  },
];

export const arcPolygonScenarios: ArcScenario[] = [
  {
    name: 'Circle',
    build: () => ArcPolygon2.fromCircle2(new Circle2(V(0, 0), 2)),
    offsets: [0.5, -0.5],
    query: V(1, 1),
  },
  { name: '"D"', build: () => new ArcPolygon2([V(0, 0), V(4, 0)], [0, -2]), query: V(2, 1) },
  {
    name: 'Bulged and dented sides',
    build: () => new ArcPolygon2([V(0, 0), V(4, 0), V(4, 4), V(0, 4)], [0, -1, 0, 0.8]),
    offsets: [0.4],
    query: V(4.5, 2),
  },
  { name: 'Rounded rectangle', build: () => roundedRectangle(0, 0, 6, 4, 1), offsets: [0.5, -0.5], query: V(0.2, 0.2) },
];

export const arcScenarioRows = [arcScenarios, arcPolylineScenarios, arcPolygonScenarios] as const;
