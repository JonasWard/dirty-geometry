import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Interval2 } from '@dirty-geometry/vec2/bounds/interval2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import type { Geometry2 } from '@dirty-geometry/vec2/operations/overlap2';
import { Overlap2 } from '@dirty-geometry/vec2/operations/overlap2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { frameAnchorPoints, geometryKind as geometryKindFromVisual } from '../../geometry';

export type Overlap2ScenarioSection = 'curve' | 'region' | 'circle' | 'halfPlane' | 'box' | 'polyline' | 'touching';

export type Overlap2Scenario = {
  name: string;
  section: Overlap2ScenarioSection;
  a: Geometry2;
  b: Geometry2;
  slack?: Epsilon;
};

const square = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);
const unitCircle = new Circle2(new Vec2(0, 0), 1);
const xAxis = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));

export const overlap2CurveScenarios: Overlap2Scenario[] = [
  {
    name: 'Coincident points',
    section: 'curve',
    a: new Vec2(1, 2),
    b: new Vec2(1, 2),
  },
  {
    name: 'Separated points',
    section: 'curve',
    a: new Vec2(0, 0),
    b: new Vec2(3, 0),
  },
  {
    name: 'Shared segment interval',
    section: 'curve',
    a: new Line2(new Vec2(0, 0), new Vec2(10, 0)),
    b: new Line2(new Vec2(2, 0), new Vec2(8, 0)),
  },
  {
    name: 'Parallel disjoint',
    section: 'curve',
    a: new Line2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Line2(new Vec2(0, 2), new Vec2(1, 2)),
  },
  {
    name: 'Crossing segments',
    section: 'curve',
    a: new Line2(new Vec2(0, 0), new Vec2(2, 2)),
    b: new Line2(new Vec2(0, 2), new Vec2(2, 0)),
  },
  {
    name: 'Ray sub-ray',
    section: 'curve',
    a: new Ray2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(3, 0), new Vec2(1, 0)),
  },
];

export const overlap2RegionScenarios: Overlap2Scenario[] = [
  {
    name: 'Point in polygon',
    section: 'region',
    a: square,
    b: new Vec2(5, 5),
  },
  {
    name: 'Point outside polygon',
    section: 'region',
    a: square,
    b: new Vec2(15, 5),
  },
  {
    name: 'Squares overlap',
    section: 'region',
    a: square,
    b: new Polygon2([new Vec2(5, 5), new Vec2(15, 5), new Vec2(15, 15), new Vec2(5, 15)]),
  },
  {
    name: 'Disjoint squares',
    section: 'region',
    a: square,
    b: new Polygon2([new Vec2(20, 0), new Vec2(30, 0), new Vec2(30, 10), new Vec2(20, 10)]),
  },
  {
    name: 'Segment crosses square',
    section: 'region',
    a: square,
    b: new Line2(new Vec2(-1, 5), new Vec2(11, 5)),
  },
];

export const overlap2CircleScenarios: Overlap2Scenario[] = [
  {
    name: 'Nested circles',
    section: 'circle',
    a: unitCircle,
    b: new Circle2(new Vec2(0, 0), 0.5),
  },
  {
    name: 'Separated circles',
    section: 'circle',
    a: unitCircle,
    b: new Circle2(new Vec2(3, 0), 1),
  },
  {
    name: 'Circle crosses square',
    section: 'circle',
    a: square,
    b: new Circle2(new Vec2(10, 5), 2),
  },
];

export const overlap2HalfPlaneScenarios: Overlap2Scenario[] = [
  {
    name: 'Point in half-plane',
    section: 'halfPlane',
    a: xAxis,
    b: new Vec2(1, -1),
  },
  {
    name: 'Point outside half-plane',
    section: 'halfPlane',
    a: xAxis,
    b: new Vec2(1, 1),
  },
  {
    name: 'Ray in half-plane',
    section: 'halfPlane',
    a: xAxis,
    b: new Ray2(new Vec2(0, -1), new Vec2(0, -1)),
  },
];

export const overlap2BoxScenarios: Overlap2Scenario[] = [
  {
    name: 'Boxes overlap',
    section: 'box',
    a: Aabb2.fromIntervals(new Interval2(0, 5), new Interval2(0, 5)),
    b: Aabb2.fromIntervals(new Interval2(4, 8), new Interval2(4, 8)),
  },
  {
    name: 'Boxes disjoint',
    section: 'box',
    a: Aabb2.fromIntervals(new Interval2(0, 1), new Interval2(0, 1)),
    b: Aabb2.fromIntervals(new Interval2(2, 3), new Interval2(2, 3)),
  },
];

export const overlap2PolylineScenarios: Overlap2Scenario[] = [
  {
    name: 'Polyline crosses square',
    section: 'polyline',
    a: square,
    b: new Polyline2([new Vec2(-1, 5), new Vec2(11, 5)]),
  },
  {
    name: 'Polyline outside square',
    section: 'polyline',
    a: square,
    b: new Polyline2([new Vec2(-3, -2), new Vec2(-1, -1)]),
  },
];

const touchingCircle = new Circle2(new Vec2(2, 0), 1);
const cornerSquare = new Polygon2([new Vec2(10, 10), new Vec2(20, 10), new Vec2(20, 20), new Vec2(10, 20)]);
const tangentCircle = new Circle2(new Vec2(11, 5), 1);
const meshOnEdge = new TriMesh2([new Vec2(10, 5), new Vec2(12, 5), new Vec2(11, 8)], [[0, 1, 2]]);

/** Zero-measure contact: overlap with preferIn, disjoint with preferOut. */
export const overlap2TouchingScenarios: Overlap2Scenario[] = [
  {
    name: 'Point on segment (preferIn)',
    section: 'touching',
    a: new Vec2(1, 0),
    b: new Line2(new Vec2(0, 0), new Vec2(2, 0)),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Point on segment (preferOut)',
    section: 'touching',
    a: new Vec2(1, 0),
    b: new Line2(new Vec2(0, 0), new Vec2(2, 0)),
    slack: Epsilon.preferOut,
  },
  {
    name: 'Segments touch (preferIn)',
    section: 'touching',
    a: new Line2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Line2(new Vec2(1, 0), new Vec2(2, 0)),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Segments touch (preferOut)',
    section: 'touching',
    a: new Line2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Line2(new Vec2(1, 0), new Vec2(2, 0)),
    slack: Epsilon.preferOut,
  },
  {
    name: 'Rays touch (preferIn)',
    section: 'touching',
    a: new Ray2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(2, 0), new Vec2(-1, 0)),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Rays touch (preferOut)',
    section: 'touching',
    a: new Ray2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(2, 0), new Vec2(-1, 0)),
    slack: Epsilon.preferOut,
  },
  {
    name: 'Circles touch (preferIn)',
    section: 'touching',
    a: unitCircle,
    b: touchingCircle,
    slack: Epsilon.preferIn,
  },
  {
    name: 'Circles touch (preferOut)',
    section: 'touching',
    a: unitCircle,
    b: touchingCircle,
    slack: Epsilon.preferOut,
  },
  {
    name: 'Boxes touch (preferIn)',
    section: 'touching',
    a: Aabb2.fromIntervals(new Interval2(0, 1), new Interval2(0, 1)),
    b: Aabb2.fromIntervals(new Interval2(1, 2), new Interval2(1, 2)),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Boxes touch (preferOut)',
    section: 'touching',
    a: Aabb2.fromIntervals(new Interval2(0, 1), new Interval2(0, 1)),
    b: Aabb2.fromIntervals(new Interval2(1, 2), new Interval2(1, 2)),
    slack: Epsilon.preferOut,
  },
  {
    name: 'Polygons touch (preferIn)',
    section: 'touching',
    a: square,
    b: cornerSquare,
    slack: Epsilon.preferIn,
  },
  {
    name: 'Polygons touch (preferOut)',
    section: 'touching',
    a: square,
    b: cornerSquare,
    slack: Epsilon.preferOut,
  },
  {
    name: 'Point on polygon (preferIn)',
    section: 'touching',
    a: square,
    b: new Vec2(10, 5),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Point on polygon (preferOut)',
    section: 'touching',
    a: square,
    b: new Vec2(10, 5),
    slack: Epsilon.preferOut,
  },
  {
    name: 'Circle tangent polygon (preferIn)',
    section: 'touching',
    a: square,
    b: tangentCircle,
    slack: Epsilon.preferIn,
  },
  {
    name: 'Circle tangent polygon (preferOut)',
    section: 'touching',
    a: square,
    b: tangentCircle,
    slack: Epsilon.preferOut,
  },
  {
    name: 'Half-plane boundary (preferIn)',
    section: 'touching',
    a: xAxis,
    b: new Vec2(1, 0),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Half-plane boundary (preferOut)',
    section: 'touching',
    a: xAxis,
    b: new Vec2(1, 0),
    slack: Epsilon.preferOut,
  },
  {
    name: 'Polyline on edge (preferIn)',
    section: 'touching',
    a: square,
    b: new Polyline2([new Vec2(12, 5), new Vec2(10, 5)]),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Polyline on edge (preferOut)',
    section: 'touching',
    a: square,
    b: new Polyline2([new Vec2(12, 5), new Vec2(10, 5)]),
    slack: Epsilon.preferOut,
  },
  {
    name: 'TriMesh on edge (preferIn)',
    section: 'touching',
    a: square,
    b: meshOnEdge,
    slack: Epsilon.preferIn,
  },
  {
    name: 'TriMesh on edge (preferOut)',
    section: 'touching',
    a: square,
    b: meshOnEdge,
    slack: Epsilon.preferOut,
  },
];

export const overlap2Scenarios: Overlap2Scenario[] = [
  ...overlap2CurveScenarios,
  ...overlap2RegionScenarios,
  ...overlap2CircleScenarios,
  ...overlap2HalfPlaneScenarios,
  ...overlap2BoxScenarios,
  ...overlap2PolylineScenarios,
  ...overlap2TouchingScenarios,
];

export function evaluateOverlapScenario(scenario: Overlap2Scenario): boolean {
  return Overlap2.overlaps(scenario.a, scenario.b, scenario.slack ?? Epsilon.preferIn);
}

/** Collect world-space points used to fit each scenario into its frame cell. */
export function scenarioAnchorPoints(scenario: Overlap2Scenario): Vec2[] {
  return frameAnchorPoints([scenario.a, scenario.b]);
}

export function geometryKind(geometry: Geometry2): string {
  return geometryKindFromVisual(geometry);
}
