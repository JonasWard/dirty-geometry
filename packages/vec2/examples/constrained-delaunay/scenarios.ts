import {
  collectConstraintSources,
  constrainedDelaunay,
  constraintEdge,
  type ConstraintEdge,
} from '../../src/operations/constrained-delaunay';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import type { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';

export type CdtConstraintSegment = {
  from: Vec2;
  to: Vec2;
};

export type CdtScenario = {
  name: string;
  points: Vec2[];
  constraints: ConstraintEdge[];
  /** Geometric constraint segments (stable after vertex dedupe / splits). */
  constraintSegments: CdtConstraintSegment[];
};

type ShapeInput = { kind: 'polyline'; shape: Polyline2 } | { kind: 'polygon'; shape: Polygon2 };

function scenarioFromPoints(
  name: string,
  points: Vec2[],
  constraints: readonly (readonly [number, number])[],
): CdtScenario {
  return {
    name,
    points,
    constraints: constraints.map(([a, b]) => constraintEdge(a, b)),
    constraintSegments: constraints.map(([a, b]) => ({
      from: points[a]!.clone(),
      to: points[b]!.clone(),
    })),
  };
}

function scenarioFromShapes(name: string, shapes: ShapeInput[], steiner: Vec2[] = []): CdtScenario {
  const { points, constraints, constraintSegments } = collectConstraintSources([
    ...shapes.map((entry) => entry.shape),
    ...steiner,
  ]);

  return {
    name,
    points,
    constraints,
    constraintSegments,
  };
}

export const cdtBasicScenarios: CdtScenario[] = [
  scenarioFromPoints('Triangle', [new Vec2(0, 0), new Vec2(4, 0), new Vec2(1, 3)], []),
  scenarioFromPoints('Square free', [new Vec2(0, 0), new Vec2(4, 0), new Vec2(4, 4), new Vec2(0, 4)], []),
  scenarioFromPoints(
    'Square constrained diagonal',
    [new Vec2(0, 0), new Vec2(4, 0), new Vec2(4, 4), new Vec2(0, 4)],
    [[1, 3]],
  ),
  scenarioFromPoints(
    'Square + center',
    [new Vec2(0, 0), new Vec2(4, 0), new Vec2(4, 4), new Vec2(0, 4), new Vec2(2, 2)],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  ),
  scenarioFromPoints(
    'Pentagon boundary',
    [new Vec2(0, 0), new Vec2(3, 0), new Vec2(4, 2), new Vec2(2, 4), new Vec2(0, 2)],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
    ],
  ),
  scenarioFromPoints(
    'Zigzag constraint',
    [new Vec2(0, 0), new Vec2(2, 3), new Vec2(4, 0), new Vec2(6, 3), new Vec2(8, 0), new Vec2(4, -2)],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  ),
  scenarioFromPoints(
    'Interior Steiner',
    [new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 4), new Vec2(0, 4), new Vec2(2, 1), new Vec2(4, 2.5)],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  ),
  scenarioFromPoints(
    'Forced long edge',
    [new Vec2(0, 0), new Vec2(5, 0), new Vec2(5, 3), new Vec2(0, 3), new Vec2(1.5, 1), new Vec2(3.5, 2)],
    [[0, 2]],
  ),
];

export const cdtShapeScenarios: CdtScenario[] = [
  scenarioFromShapes('L-polyline', [
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 4)]),
    },
  ]),
  scenarioFromShapes('Square polygon', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(5, 0), new Vec2(5, 5), new Vec2(0, 5)]),
    },
  ]),
  scenarioFromShapes('Irregular polygon', [
    {
      kind: 'polygon',
      shape: new Polygon2([
        new Vec2(0, 1),
        new Vec2(2, 0),
        new Vec2(5, 0.5),
        new Vec2(4.5, 3),
        new Vec2(2, 4),
        new Vec2(0.5, 3),
      ]),
    },
  ]),
  scenarioFromShapes('Outer + wall polyline', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 8), new Vec2(0, 8)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(3, 1), new Vec2(3, 6), new Vec2(7, 6)]),
    },
  ]),
  scenarioFromShapes('Hull + parallel walls', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 6), new Vec2(0, 6)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(1, 1), new Vec2(1, 5)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(3, 0.5), new Vec2(3, 5.5)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(5, 1), new Vec2(5, 5)]),
    },
  ]),
  scenarioFromShapes('Outer + inner polygon', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(8, 0), new Vec2(8, 8), new Vec2(0, 8)]),
    },
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(2, 2), new Vec2(5, 2), new Vec2(5, 5), new Vec2(2, 5)]),
    },
  ]),
  scenarioFromShapes('Room + partition', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 4), new Vec2(0, 4)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(3, 0), new Vec2(3, 4)]),
    },
  ]),
  scenarioFromShapes(
    'Polygon + Steiner',
    [
      {
        kind: 'polygon',
        shape: new Polygon2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 5), new Vec2(0, 5)]),
      },
    ],
    [new Vec2(2, 2), new Vec2(4, 3)],
  ),
  scenarioFromShapes('Zigzag + triangle', [
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(0, 0), new Vec2(2, 3), new Vec2(4, 0), new Vec2(6, 3)]),
    },
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(1, -2), new Vec2(5, -2), new Vec2(3, -0.5)]),
    },
  ]),
];

function wavyPolyline(count: number, width: number, amplitude: number): Polyline2 {
  const vertices: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    vertices.push(new Vec2(t * width, Math.sin(t * Math.PI * 4) * amplitude + (i % 2) * 0.15));
  }
  return new Polyline2(vertices);
}

/** Self-intersecting pentagram ({5/2}) as a closed polygon. */
function pentagramPolygon(radius: number): Polygon2 {
  const tips = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  return new Polygon2([tips[0]!, tips[2]!, tips[4]!, tips[1]!, tips[3]!]);
}

export const cdtComplexScenarios: CdtScenario[] = [
  scenarioFromShapes('Long wavy polyline', [{ kind: 'polyline', shape: wavyPolyline(24, 20, 2.5) }]),
  scenarioFromShapes('Large building outline', [
    {
      kind: 'polygon',
      shape: new Polygon2([
        new Vec2(0, 0),
        new Vec2(14, 0),
        new Vec2(14, 4),
        new Vec2(10, 4),
        new Vec2(10, 8),
        new Vec2(18, 8),
        new Vec2(18, 14),
        new Vec2(6, 14),
        new Vec2(6, 10),
        new Vec2(0, 10),
      ]),
    },
  ]),
  scenarioFromShapes('Campus: hull + paths + courts', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(20, 0), new Vec2(20, 14), new Vec2(0, 14)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([
        new Vec2(2, 2),
        new Vec2(6, 2),
        new Vec2(6, 7),
        new Vec2(12, 7),
        new Vec2(12, 3),
        new Vec2(17, 3),
        new Vec2(17, 11),
      ]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(3, 12), new Vec2(3, 8), new Vec2(9, 8), new Vec2(9, 12)]),
    },
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(14, 5), new Vec2(18, 5), new Vec2(18, 9), new Vec2(14, 9)]),
    },
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(1, 4), new Vec2(4, 4), new Vec2(4, 6), new Vec2(1, 6)]),
    },
  ]),
  scenarioFromShapes('Bowtie self-intersecting polygon', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(4, 3), new Vec2(0, 3), new Vec2(4, 0)]),
    },
  ]),
  scenarioFromShapes('Self-intersecting pentagram', [{ kind: 'polygon', shape: pentagramPolygon(5) }]),
  scenarioFromShapes('Crossing polylines X', [
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(0, 0), new Vec2(2, 1), new Vec2(4, 0), new Vec2(6, 2), new Vec2(8, 1)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(0, 2), new Vec2(2, 0), new Vec2(4, 2), new Vec2(6, 0), new Vec2(8, 2)]),
    },
  ]),
  scenarioFromShapes('Figure-eight polyline', [
    {
      kind: 'polyline',
      shape: new Polyline2([
        new Vec2(0, 0),
        new Vec2(2, 2),
        new Vec2(4, 0),
        new Vec2(2, -2),
        new Vec2(0, 0),
        new Vec2(-2, 2),
        new Vec2(-4, 0),
        new Vec2(-2, -2),
        new Vec2(0, 0),
      ]),
    },
  ]),
  scenarioFromShapes('Self-crossing corridor + rooms', [
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(0, 0), new Vec2(16, 0), new Vec2(16, 10), new Vec2(0, 10)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(2, 1), new Vec2(8, 8), new Vec2(14, 1)]),
    },
    {
      kind: 'polyline',
      shape: new Polyline2([new Vec2(2, 8), new Vec2(8, 1), new Vec2(14, 8)]),
    },
    {
      kind: 'polygon',
      shape: new Polygon2([new Vec2(1, 3), new Vec2(4, 3), new Vec2(4, 6), new Vec2(1, 6)]),
    },
  ]),
  scenarioFromShapes(
    'Dense wavy + steiner scatter',
    [{ kind: 'polyline', shape: wavyPolyline(18, 16, 3) }],
    Array.from({ length: 20 }, (_, i) => {
      const x = (i % 5) * 3 + 2;
      const y = Math.floor(i / 5) * 2 - 1;
      return new Vec2(x, y);
    }),
  ),
];

export const cdtScenarios: CdtScenario[] = [...cdtBasicScenarios, ...cdtShapeScenarios, ...cdtComplexScenarios];

export function evaluateCdtScenario(scenario: CdtScenario): TriMesh2 {
  return constrainedDelaunay(scenario.points, scenario.constraints);
}
