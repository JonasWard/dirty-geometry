import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { frameAnchorPoints, geometryKind as geometryKindFromVisual } from '../../geometry';

export type Aabb2Geometry = Line2 | Circle2 | Polyline2 | Polygon2 | TriMesh2 | Ray2 | InfiniteLine2;

export type Aabb2ScenarioSection = 'finite' | 'unbounded' | 'union';

export type Aabb2Scenario = {
  name: string;
  section: Aabb2ScenarioSection;
  geometry?: Aabb2Geometry;
  definitionGeometry?: boolean;
  unionItems?: readonly (Aabb2Geometry | Vec2)[];
};

export const aabb2FiniteScenarios: Aabb2Scenario[] = [
  {
    name: 'Line segment',
    section: 'finite',
    geometry: new Line2(new Vec2(1, 1), new Vec2(8, 6)),
  },
  {
    name: 'Circle',
    section: 'finite',
    geometry: new Circle2(new Vec2(5, 5), 3),
  },
  {
    name: 'Polyline',
    section: 'finite',
    geometry: new Polyline2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 6)]),
  },
  {
    name: 'Polygon',
    section: 'finite',
    geometry: new Polygon2([new Vec2(1, 2), new Vec2(7, 1), new Vec2(9, 7), new Vec2(2, 8)]),
  },
  {
    name: 'TriMesh',
    section: 'finite',
    geometry: new TriMesh2(
      [new Vec2(0, 0), new Vec2(6, 0), new Vec2(0, 5), new Vec2(6, 5)],
      [
        [0, 1, 2],
        [1, 3, 2],
      ],
    ),
  },
];

export const aabb2UnboundedScenarios: Aabb2Scenario[] = [
  {
    name: 'Ray diagonal',
    section: 'unbounded',
    geometry: new Ray2(new Vec2(1, 2), new Vec2(3, 4)),
  },
  {
    name: 'Ray horizontal',
    section: 'unbounded',
    geometry: new Ray2(new Vec2(1, 4), new Vec2(2, 0)),
  },
  {
    name: 'Ray definition',
    section: 'unbounded',
    geometry: new Ray2(new Vec2(1, 2), new Vec2(4, 0)),
    definitionGeometry: true,
  },
  {
    name: 'Line horizontal',
    section: 'unbounded',
    geometry: new InfiniteLine2(new Vec2(0, 3), new Vec2(1, 0)),
  },
  {
    name: 'Line vertical',
    section: 'unbounded',
    geometry: new InfiniteLine2(new Vec2(5, 0), new Vec2(0, 2)),
  },
  {
    name: 'Line diagonal',
    section: 'unbounded',
    geometry: new InfiniteLine2(new Vec2(0, 0), new Vec2(2, 3)),
  },
  {
    name: 'Line definition',
    section: 'unbounded',
    geometry: new InfiniteLine2(new Vec2(1, 1), new Vec2(3, 2)),
    definitionGeometry: true,
  },
];

export const aabb2UnionScenarios: Aabb2Scenario[] = [
  {
    name: 'Line + circle + point',
    section: 'union',
    unionItems: [new Line2(new Vec2(0, 0), new Vec2(4, 0)), new Circle2(new Vec2(7, 3), 2), new Vec2(2, 8)],
  },
  {
    name: 'Polyline + polygon',
    section: 'union',
    unionItems: [
      new Polyline2([new Vec2(0, 0), new Vec2(6, 0), new Vec2(6, 3)]),
      new Polygon2([new Vec2(4, 4), new Vec2(9, 4), new Vec2(9, 9), new Vec2(4, 9)]),
    ],
  },
];

export const aabb2Scenarios: Aabb2Scenario[] = [
  ...aabb2FiniteScenarios,
  ...aabb2UnboundedScenarios,
  ...aabb2UnionScenarios,
];

export function aabbOfGeometry(geometry: Aabb2Geometry, definitionGeometry = false): Aabb2 {
  if (geometry instanceof Ray2 || geometry instanceof InfiniteLine2) {
    return geometry.aabb2(definitionGeometry);
  }
  return geometry.aabb2();
}

export function evaluateAabbScenario(scenario: Aabb2Scenario): Aabb2 {
  if (scenario.unionItems) {
    return Aabb2.union(
      ...scenario.unionItems.map((item) =>
        item instanceof Vec2 ? item : aabbOfGeometry(item, scenario.definitionGeometry),
      ),
    );
  }

  return aabbOfGeometry(scenario.geometry!, scenario.definitionGeometry ?? false);
}

export function scenarioAnchorPoints(scenario: Aabb2Scenario): Vec2[] {
  const definitionGeometry = scenario.definitionGeometry ?? false;
  const geometries: Geometry2[] = [];

  if (scenario.unionItems) {
    for (const item of scenario.unionItems) {
      geometries.push(item);
    }
  } else if (scenario.geometry) {
    geometries.push(scenario.geometry);
  }

  const points = frameAnchorPoints(geometries, { definitionGeometry });
  return points;
}

export function geometryKind(geometry: Aabb2Geometry): string {
  return geometryKindFromVisual(geometry);
}

export function formatAabb(box: Aabb2): string {
  if (box.isFullyInfinite()) return 'fully infinite';
  const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '∞');
  return `[${fmt(box.x.min)}, ${fmt(box.y.min)}]-[${fmt(box.x.max)}, ${fmt(box.y.max)}]`;
}
