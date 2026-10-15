import { Boolean2, asBoolean2ClipList, type Boolean2ClipInput, type Boolean2Options } from '@dirty-geometry/vec2/operations/boolean2';
import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { frameAnchorPoints } from '../../geometry';
import { Deserialise } from '@dirty-geometry/vec2/io/deserialise';

export type Boolean2ScenarioSection = 'union' | 'intersect' | 'subtract';

export type Boolean2Scenario = {
  name: string;
  section: Boolean2ScenarioSection;
  inputs: Polygon2[];
  clips?: Boolean2ClipInput;
  options?: Boolean2Options;
};

function bisectingHorizontalHalfPlane(polygons: readonly Polygon2[]): InfiniteLine2 {
  const bounds = Aabb2.union(...polygons.map((polygon) => polygon.aabb2()));
  const y = (bounds.min().y + bounds.max().y) * 0.5;

  return new InfiniteLine2(new Vec2(bounds.min().x, y), new Vec2(1, 0));
}

function bisectingDiagonalHalfPlane(polygon: Polygon2): InfiniteLine2 {
  const bounds = polygon.aabb2();
  const center = new Vec2((bounds.min().x + bounds.max().x) * 0.5, (bounds.min().y + bounds.max().y) * 0.5);

  return new InfiniteLine2(center, new Vec2(1, -1));
}

function squareAt(originX: number, originY: number, size: number): Polygon2 {
  return new Polygon2([
    new Vec2(originX, originY),
    new Vec2(originX + size, originY),
    new Vec2(originX + size, originY + size),
    new Vec2(originX, originY + size),
  ]);
}

/** Clockwise hole loop matching `squareHole` winding. */
function holeAt(originX: number, originY: number, size: number): Polygon2 {
  return new Polygon2([
    new Vec2(originX, originY),
    new Vec2(originX, originY + size),
    new Vec2(originX + size, originY + size),
    new Vec2(originX + size, originY),
  ]);
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Polygon2 {
  return new Polygon2([new Vec2(x0, y0), new Vec2(x1, y0), new Vec2(x1, y1), new Vec2(x0, y1)]);
}

const lShape = new Polygon2([
  new Vec2(0, 0),
  new Vec2(4, 0),
  new Vec2(4, 2),
  new Vec2(2, 2),
  new Vec2(2, 4),
  new Vec2(0, 4),
]);

const squareHole = new Polygon2([new Vec2(1.5, 1.5), new Vec2(1.5, 2.5), new Vec2(2.5, 2.5), new Vec2(2.5, 1.5)]);

export const boolean2UnionScenarios: Boolean2Scenario[] = [
  {
    name: 'Overlapping squares',
    section: 'union',
    inputs: [squareAt(0, 0, 2), squareAt(1, 0, 2)],
  },
  {
    name: 'Disjoint squares',
    section: 'union',
    inputs: [squareAt(0, 0, 1), squareAt(2.5, 0, 1)],
  },
  {
    name: 'Square with hole',
    section: 'union',
    inputs: [squareAt(0, 0, 4), squareHole],
  },
  {
    name: 'L-shape union',
    section: 'union',
    inputs: [lShape, squareAt(3, 1, 1.5)],
  },
];

export const boolean2IntersectScenarios: Boolean2Scenario[] = [
  {
    name: 'Square ∩ lower half',
    section: 'intersect',
    inputs: [squareAt(0, 0, 2)],
    clips: bisectingHorizontalHalfPlane([squareAt(0, 0, 2)]),
  },
  {
    name: 'Wide square ∩ lower half',
    section: 'intersect',
    inputs: [rectangle(0, 0, 3, 2)],
    clips: bisectingHorizontalHalfPlane([rectangle(0, 0, 3, 2)]),
  },
  {
    name: 'Perforated square ∩ lower half',
    section: 'intersect',
    inputs: [squareAt(0, 0, 4), squareHole],
    clips: bisectingHorizontalHalfPlane([squareAt(0, 0, 4), squareHole]),
  },
  {
    name: 'Square ∩ diagonal half',
    section: 'intersect',
    inputs: [squareAt(0, 0, 3)],
    clips: bisectingDiagonalHalfPlane(squareAt(0, 0, 3)),
  },
];

export const boolean2SubtractScenarios: Boolean2Scenario[] = [
  {
    name: 'Square − lower half',
    section: 'subtract',
    inputs: [squareAt(0, 0, 2)],
    clips: bisectingHorizontalHalfPlane([squareAt(0, 0, 2)]),
  },
  {
    name: 'L-shape − lower half',
    section: 'subtract',
    inputs: [lShape],
    clips: bisectingHorizontalHalfPlane([lShape]),
  },
  {
    name: 'Square with hole − lower half',
    section: 'subtract',
    inputs: [squareAt(0, 0, 4), squareHole],
    clips: bisectingHorizontalHalfPlane([squareAt(0, 0, 4), squareHole]),
  },
  {
    name: 'Wide square − diagonal half',
    section: 'subtract',
    inputs: [rectangle(0, 0, 4, 2)],
    clips: bisectingDiagonalHalfPlane(rectangle(0, 0, 4, 2)),
  },
  {
    name: 'room-05812ce6-2cdf-40bd-9194-8d68b5a67b9c-6',
    section: 'subtract',
    inputs: [
      Deserialise.polygon2({
        type: 'Polygon2',
        vertices: [
          { type: 'Vec2', x: 0.4009999930858612, y: -4.042999982833862 },
          { type: 'Vec2', x: 2.076000094413757, y: -4.042999982833862 },
          { type: 'Vec2', x: 2.0760000944137573, y: -1.887000024318695 },
          { type: 'Vec2', x: 0.4009999930858612, y: -1.887000024318695 },
        ],
      }),
    ],
    clips: [],
  },
  {
    name: 'room-0a17cacb-5587-49ae-a036-78bc06ff64f0-0',
    section: 'subtract',
    inputs: [
      Deserialise.polygon2({
        type: 'Polygon2',
        vertices: [
          { type: 'Vec2', x: 6.354000091552734, y: -4.610999822616577 },
          { type: 'Vec2', x: 9.26800012588501, y: -4.610999822616577 },
          { type: 'Vec2', x: 11.071000099182129, y: -4.610999822616577 },
          { type: 'Vec2', x: 11.071000099182129, y: -2.9450000524520874 },
          { type: 'Vec2', x: 7.66700005531311, y: -2.9450000524520874 },
          { type: 'Vec2', x: 6.424999952316284, y: -2.9450000524520874 },
          { type: 'Vec2', x: 6.424999952316284, y: -2.3890000581741333 },
          { type: 'Vec2', x: 4.935999870300293, y: -2.3890000581741333 },
          { type: 'Vec2', x: 4.935999870300293, y: -2.9450000524520874 },
          { type: 'Vec2', x: 3.159000039100647, y: -2.9450000524520874 },
          { type: 'Vec2', x: 3.159000039100647, y: -3.575000047683716 },
          { type: 'Vec2', x: 3.1590000391006474, y: -6.444000005722046 },
          { type: 'Vec2', x: 0.4009999930858612, y: -6.444000005722046 },
          { type: 'Vec2', x: 0.4009999930858612, y: -10.699000358581543 },
          { type: 'Vec2', x: 6.354000091552734, y: -10.699000358581543 },
          { type: 'Vec2', x: 6.354000091552734, y: -8.815999984741211 },
        ],
      }),
    ],
    clips: [
      {
        type: 'Polygon2',
        vertices: [
          { type: 'Vec2', x: 0.4009999930858612, y: -6.444000005722046 },
          { type: 'Vec2', x: 0.4009999930858612, y: -10.699000358581543 },
          { type: 'Vec2', x: 1.1102230246251565e-16, y: -10.699000358581543 },
          { type: 'Vec2', x: 1.1102230246251565e-16, y: -6.444000005722046 },
        ],
      },
      {
        type: 'Polygon2',
        vertices: [
          { type: 'Vec2', x: 0.4009999930858612, y: -10.699000358581543 },
          { type: 'Vec2', x: 6.354000091552734, y: -10.699000358581543 },
          { type: 'Vec2', x: 6.354000091552734, y: -11.100000381469727 },
          { type: 'Vec2', x: 0.4009999930858612, y: -11.100000381469727 },
        ],
      },
      {
        type: 'Polygon2',
        vertices: [
          { type: 'Vec2', x: 6.354000091552734, y: -10.699000358581543 },
          { type: 'Vec2', x: 6.354000091552734, y: -8.815999984741211 },
          { type: 'Vec2', x: 6.755000114440918, y: -8.815999984741211 },
          { type: 'Vec2', x: 6.755000114440918, y: -10.699000358581543 },
        ],
      },
    ].map(Deserialise.polygon2),
  },
];

export const boolean2IntersectPolygonScenarios: Boolean2Scenario[] = [
  {
    name: 'Overlapping squares',
    section: 'intersect',
    inputs: [squareAt(0, 0, 3)],
    clips: squareAt(1, 0, 3),
  },
  {
    name: 'Square ∩ corner square',
    section: 'intersect',
    inputs: [squareAt(0, 0, 4)],
    clips: squareAt(2.5, 2.5, 2),
  },
  {
    name: 'L-shape ∩ square',
    section: 'intersect',
    inputs: [lShape],
    clips: squareAt(1, 0, 3),
  },
  {
    name: 'Disjoint squares',
    section: 'intersect',
    inputs: [squareAt(0, 0, 1.5)],
    clips: squareAt(2.5, 0, 1.5),
  },
];

export const boolean2SubtractPolygonScenarios: Boolean2Scenario[] = [
  {
    name: 'Square − inner square',
    section: 'subtract',
    inputs: [squareAt(0, 0, 4)],
    clips: squareAt(1.5, 1.5, 1),
  },
  {
    name: 'Square − corner square',
    section: 'subtract',
    inputs: [squareAt(0, 0, 4)],
    clips: squareAt(2, 2, 2),
  },
  {
    name: 'L-shape − leg square',
    section: 'subtract',
    inputs: [lShape],
    clips: squareAt(0.5, 0.5, 1.5),
  },
  {
    name: 'Wide square − overlap',
    section: 'subtract',
    inputs: [rectangle(0, 0, 5, 3)],
    clips: squareAt(2, 0.5, 2),
  },
];

export const boolean2ManyIntersectScenarios: Boolean2Scenario[] = [
  {
    name: 'Two subjects ∩ two clips',
    section: 'intersect',
    inputs: [squareAt(0, 0, 3), squareAt(2, 0, 3)],
    clips: [squareAt(1, 0, 2), squareAt(0, 0, 2.5)],
  },
  {
    name: 'L-shape union ∩ square + half',
    section: 'intersect',
    inputs: [lShape, squareAt(3, 1, 1.5)],
    clips: [squareAt(0, 0, 4.5), bisectingHorizontalHalfPlane([lShape, squareAt(3, 1, 1.5)])],
  },
  {
    name: 'Perforated ∩ two bands',
    section: 'intersect',
    inputs: [squareAt(0, 0, 5), squareHole],
    clips: [rectangle(0, 0, 5, 1.5), rectangle(0, 0, 1.5, 5)],
  },
  {
    name: 'Three blocks ∩ cross clips',
    section: 'intersect',
    inputs: [squareAt(0, 0, 2), squareAt(1.5, 0, 2), squareAt(0.75, 1.5, 2)],
    clips: [rectangle(0.5, 0, 2.5, 2.5), rectangle(0, 0.5, 3, 2.5)],
  },
];

export const boolean2ManySubtractScenarios: Boolean2Scenario[] = [
  {
    name: 'Square − two holes',
    section: 'subtract',
    inputs: [squareAt(0, 0, 5)],
    clips: [squareAt(1, 1, 1), squareAt(3, 3, 1)],
  },
  {
    name: 'L-shape − two leg cuts',
    section: 'subtract',
    inputs: [lShape],
    clips: [squareAt(0.5, 0.5, 1.5), squareAt(2.5, 0.5, 1)],
  },
  {
    name: 'Two subjects − holes + half',
    section: 'subtract',
    inputs: [squareAt(0, 0, 5), squareAt(4, 0, 3), holeAt(1, 3, 1), holeAt(5.25, 2.55, 0.7)],
    clips: [
      bisectingHorizontalHalfPlane([squareAt(0, 0, 5), squareAt(4, 0, 3), holeAt(1, 3, 1), holeAt(5.25, 2.55, 0.7)]),
    ],
  },
  {
    name: 'Perforated − corner + center',
    section: 'subtract',
    inputs: [squareAt(0, 0, 5), squareHole],
    clips: [squareAt(3.5, 3.5, 1), squareAt(0.5, 3.5, 1)],
  },
];

export const boolean2Scenarios: Boolean2Scenario[] = [
  ...boolean2UnionScenarios,
  ...boolean2IntersectScenarios,
  ...boolean2SubtractScenarios,
  ...boolean2IntersectPolygonScenarios,
  ...boolean2SubtractPolygonScenarios,
  ...boolean2ManyIntersectScenarios,
  ...boolean2ManySubtractScenarios,
];

export function evaluateBooleanScenario(scenario: Boolean2Scenario) {
  const options: Boolean2Options = { mesh: true, ...scenario.options };

  if (scenario.section === 'union') {
    return Boolean2.union(scenario.inputs, options);
  }

  if (scenario.section === 'intersect') {
    return Boolean2.intersect(scenario.inputs, scenario.clips!, options);
  }

  return Boolean2.subtract(scenario.inputs, scenario.clips!, options);
}

export function scenarioClips(scenario: Boolean2Scenario) {
  return scenario.clips ? asBoolean2ClipList(scenario.clips) : [];
}

export function scenarioAnchorPoints(scenario: Boolean2Scenario): Vec2[] {
  const result = evaluateBooleanScenario(scenario);
  const geometries: Geometry2[] = [...scenario.inputs, ...scenarioClips(scenario)];

  if (result.triMesh) {
    geometries.push(result.triMesh);
  } else {
    geometries.push(...result.polygons);
  }

  return frameAnchorPoints(geometries);
}

export function removedHalfSamplePoint(scenario: Boolean2Scenario): Vec2 | null {
  const halfPlane = scenarioClips(scenario).find((clip): clip is InfiniteLine2 => clip.type === 'InfiniteLine2');
  if (!halfPlane) {
    return null;
  }

  const bounds = Aabb2.union(...scenario.inputs.map((polygon) => polygon.aabb2()));
  const center = new Vec2((bounds.min().x + bounds.max().x) * 0.5, (bounds.min().y + bounds.max().y) * 0.5);
  const direction = halfPlane.direction.unit();
  const offset = new Vec2(-direction.y, direction.x);

  return center.add(offset.scale(Math.max(bounds.width(), bounds.height()) * 0.25));
}

export function pointInsideScenario(scenario: Boolean2Scenario, point: Vec2): boolean {
  const result = evaluateBooleanScenario(scenario);

  if (result.triMesh && result.triMesh.triangles.length > 0) {
    return result.triMesh.containsPoint(point, scenario.options?.slack ?? Epsilon.preferIn);
  }

  return Polygon2.isPointInside(result.polygons, point, scenario.options?.slack ?? Epsilon.preferIn);
}
