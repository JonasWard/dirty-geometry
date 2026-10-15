import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';

export type CurveKind = 'polyline' | 'polygon';

export type CurveScenario = {
  name: string;
  kind: CurveKind;
  vertices: Vec2[];
  /** Samples in the index domain (`evaluate`). */
  indexSamples: number[];
  /** Samples in arc-length domain (`evaluateAtLength`). */
  lengthSamples: number[];
  /** Optional closest-point query shown in the visualisation. */
  query?: Vec2;
  /**
   * Extra slack for closest-point queries. Near-misses within this distance of the
   * minimum are shown alongside the strict closest points.
   */
  additionalTolerance?: number;
};

export const polylineScenarios: CurveScenario[] = [
  {
    name: 'L polyline',
    kind: 'polyline',
    vertices: [new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10)],
    indexSamples: [0, 0.5, 1, 1.5, 2],
    lengthSamples: [0, 5, 10, 15, 20],
    query: new Vec2(5, 3),
  },
  {
    name: 'Unequal segments',
    kind: 'polyline',
    vertices: [new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 10)],
    indexSamples: [0, 0.5, 1, 1.5, 2],
    lengthSamples: [1, 2, 7, 12],
    query: new Vec2(4, 5),
  },
  {
    name: 'Zigzag',
    kind: 'polyline',
    vertices: [new Vec2(0, 0), new Vec2(4, 6), new Vec2(8, 0), new Vec2(12, 6), new Vec2(16, 0)],
    indexSamples: [0, 1, 2, 3, 4],
    lengthSamples: [0, 5, 10, 15, 20],
    query: new Vec2(8, 4),
  },
  {
    name: 'Diagonal stub',
    kind: 'polyline',
    vertices: [new Vec2(-3, -2), new Vec2(5, 4), new Vec2(1, 8)],
    indexSamples: [0, 1, 2],
    lengthSamples: [0, 4, 8],
    query: new Vec2(0, 4),
  },
  {
    name: 'Tolerance near-miss',
    kind: 'polyline',
    vertices: [new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10)],
    indexSamples: [0, 0.5, 1, 1.5, 2],
    lengthSamples: [5, 15],
    query: new Vec2(5, 1),
    additionalTolerance: 4.1,
  },
];

export const polygonScenarios: CurveScenario[] = [
  {
    name: 'Square',
    kind: 'polygon',
    vertices: [new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)],
    indexSamples: [0, 1, 2, 3, 4],
    lengthSamples: [0, 10, 20, 30, 40],
    query: new Vec2(5, 5),
  },
  {
    name: 'Triangle',
    kind: 'polygon',
    vertices: [new Vec2(0, 0), new Vec2(8, 0), new Vec2(4, 6)],
    indexSamples: [0, 0.5, 1, 2, 3],
    lengthSamples: [0, 4, 8, 12],
    query: new Vec2(4, 2),
  },
  {
    name: 'Irregular pentagon',
    kind: 'polygon',
    vertices: [new Vec2(0, 2), new Vec2(3, 0), new Vec2(7, 1), new Vec2(6, 5), new Vec2(1, 6)],
    indexSamples: [0, 1, 2, 3, 4, 5],
    lengthSamples: [0, 3, 6, 9, 12],
    query: new Vec2(3.5, 3),
  },
  {
    name: 'Skinny diamond',
    kind: 'polygon',
    vertices: [new Vec2(0, 0), new Vec2(6, 3), new Vec2(0, 6), new Vec2(-2, 3)],
    indexSamples: [0, 1, 2, 3, 4],
    lengthSamples: [2, 6, 10, 14],
    query: new Vec2(8, 3),
  },
  {
    name: 'Tolerance near-miss',
    kind: 'polygon',
    vertices: [new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)],
    indexSamples: [0, 0.5, 1, 2, 3, 4],
    lengthSamples: [5, 20, 35],
    query: new Vec2(5, -1),
    additionalTolerance: 4.2,
  },
];

export const curveScenarios: CurveScenario[] = [...polylineScenarios, ...polygonScenarios];

export function createCurve(scenario: CurveScenario): Polyline2 | Polygon2 {
  return scenario.kind === 'polyline'
    ? new Polyline2(scenario.vertices.map((v) => v.clone()))
    : new Polygon2(scenario.vertices.map((v) => v.clone()));
}
