/** Minkowski2: convex sums, rounded offsets, general sums with holes, and the two differences. */
import type { Length } from '../../src/core/numbers';
import { Vec2 } from '../../src/core/vec2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import type { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Epsilon } from '../../src/core/epsilon';
import type { Boolean2Result } from '../../src/operations/boolean2';
import { convexPieces } from '../../src/operations/helpers/minkowski/convex-pieces';
import { capsule } from '../../src/operations/helpers/minkowski/rounded';
import { Minkowski2 } from '../../src/operations/minkowski2';
import { mulberry32 } from '../random';

export type Minkowski2Section = 'convex' | 'disc' | 'sum' | 'negated' | 'erode';

export type Minkowski2Scenario = {
  name: string;
  section: Minkowski2Section;
  a: Polygon2[];
  /** The second shape (not used by `disc`). */
  b?: Polygon2[];
  /** The disc radius (`disc` only). */
  radius?: Length;
  /**
   * A step of how a non-convex shape is handled, to draw instead of (or under) the result: the convex pieces,
   * every pair of pieces summed, the union of those sums, or (for `disc`) the capsule around every edge.
   */
  stage?: Minkowski2Stage;
};

export type Minkowski2Stage = 'pieces' | 'pairs' | 'union' | 'capsules';

const loop = (...xy: number[]) =>
  new Polygon2(Array.from({ length: xy.length / 2 }, (_, i) => new Vec2(xy[2 * i]!, xy[2 * i + 1]!)));

const rectangle = (x: number, y: number, width: number, height: number) =>
  loop(x, y, x + width, y, x + width, y + height, x, y + height);

function star(seed: number, count: number, center: Vec2, scale: number): Polygon2 {
  const random = mulberry32(seed);
  return new Polygon2(
    Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      const r = scale * (0.5 + random());
      return center.add(new Vec2(r * Math.cos(angle), r * Math.sin(angle)));
    }),
  );
}

const lShape = loop(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4);
const comb = loop(0, 0, 7, 0, 7, 4, 6, 4, 6, 1, 5, 1, 5, 4, 4, 4, 4, 1, 3, 1, 3, 4, 2, 4, 2, 1, 1, 1, 1, 4, 0, 4);
const holedSquare = [rectangle(0, 0, 6, 6), rectangle(2, 2, 2, 2).inverse()];
const triangle = loop(0, 0, 1.2, 0, 0.6, 1);

export const convexScenarios: Minkowski2Scenario[] = [
  {
    name: 'Hexagon ⊕ triangle',
    section: 'convex',
    a: [Polygon2.convexHull(star(1, 6, Vec2.origin(), 2).vertices)!],
    b: [triangle],
  },
  {
    name: 'Square ⊕ rotated square',
    section: 'convex',
    a: [rectangle(0, 0, 3, 3)],
    b: [loop(0, -1, 1, 0, 0, 1, -1, 0)],
  },
];

export const discScenarios: Minkowski2Scenario[] = [
  { name: 'Square ⊕ disc', section: 'disc', a: [rectangle(0, 0, 3, 3)], radius: 0.8 },
  { name: 'L ⊕ disc', section: 'disc', a: [lShape], radius: 0.6 },
  { name: 'Holed square ⊕ disc', section: 'disc', a: holedSquare, radius: 0.5 },
];

export const sumScenarios: Minkowski2Scenario[] = [
  { name: 'Comb ⊕ triangle', section: 'sum', a: [comb], b: [triangle] },
  { name: 'Star ⊕ star', section: 'sum', a: [star(2, 24, Vec2.origin(), 3)], b: [star(3, 9, Vec2.origin(), 1)] },
  {
    name: 'Holed square ⊕ L',
    section: 'sum',
    a: holedSquare,
    b: [loop(0, 0, 0.8, 0, 0.8, 0.4, 0.4, 0.4, 0.4, 0.8, 0, 0.8)],
  },
];

export const differenceScenarios: Minkowski2Scenario[] = [
  { name: 'L ⊕ −triangle', section: 'negated', a: [lShape], b: [triangle] },
  { name: 'L ⊖ square', section: 'erode', a: [lShape], b: [rectangle(-0.5, -0.5, 1, 1)] },
  { name: 'Comb ⊖ small triangle', section: 'erode', a: [comb], b: [loop(-0.3, -0.2, 0.3, -0.2, 0, 0.3)] },
];

const smallL = loop(0, 0, 0.8, 0, 0.8, 0.4, 0.4, 0.4, 0.4, 0.8, 0, 0.8);

/** The same sum three times: split into convex pieces, every pair of pieces summed, the union of the sums. */
const sumSteps = (name: string, a: Polygon2[], b: Polygon2[]): Minkowski2Scenario[] => [
  { name: `${name}: 1 convex pieces`, section: 'sum', a, b, stage: 'pieces' },
  { name: `${name}: 2 pair sums`, section: 'sum', a, b, stage: 'pairs' },
  { name: `${name}: 3 union`, section: 'sum', a, b, stage: 'union' },
];

/** How `sum` and `sumDisc` handle non-convex shapes, step by step. */
export const stepScenarios: Minkowski2Scenario[][] = [
  sumSteps('L ⊕ triangle', [lShape], [triangle]),
  sumSteps('Comb ⊕ triangle', [comb], [triangle]),
  sumSteps('Holed square ⊕ L', holedSquare, [smallL]),
  [
    { name: 'L ⊕ disc: 1 edge capsules', section: 'disc', a: [lShape], radius: 0.6, stage: 'capsules' },
    { name: 'L ⊕ disc: 2 union', section: 'disc', a: [lShape], radius: 0.6, stage: 'union' },
  ],
];

export const minkowskiScenarioRows = [
  convexScenarios,
  discScenarios,
  sumScenarios,
  differenceScenarios,
  ...stepScenarios,
] as const;

export const minkowskiScenarios: Minkowski2Scenario[] = minkowskiScenarioRows.flat();

export function evaluateMinkowskiScenario(scenario: Minkowski2Scenario): Boolean2Result {
  const { a, b = [] } = scenario;
  switch (scenario.section) {
    case 'convex':
      return { polygons: [Minkowski2.convexSum(a[0]!, b[0]!)] };
    case 'disc':
      return Minkowski2.sumDisc(a, scenario.radius ?? 0);
    case 'sum':
      return Minkowski2.sum(a, b);
    case 'negated':
      return Minkowski2.sumNegated(a, b);
    case 'erode':
      return Minkowski2.erode(a, b);
  }
}

/** The steps of `Minkowski2.sum`: the convex pieces of each shape and the sum of every pair of them. */
export function explainSum(a: readonly Polygon2[], b: readonly Polygon2[]) {
  const piecesA = convexPieces(a, Epsilon.preferIn);
  const piecesB = convexPieces(b, Epsilon.preferIn);
  const pairs = piecesA.flatMap((p, i) =>
    piecesB.map((q, j) => ({ pieceA: i, pieceB: j, sum: Minkowski2.convexSum(p, q) })),
  );
  return { piecesA, piecesB, pairs };
}

/** The step of `Minkowski2.sumDisc` for a non-convex shape: a capsule around every edge. */
export function explainDisc(shape: readonly Polygon2[], radius: Length): ArcPolygon2[] {
  return shape.flatMap((polygon) =>
    polygon.vertices.flatMap(
      (v, i) => capsule(v, polygon.vertices[(i + 1) % polygon.vertices.length]!, radius, Epsilon.preferIn) ?? [],
    ),
  );
}
