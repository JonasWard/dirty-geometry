/** Frame fitting for the aabb2 demo: the points each scenario cell must show. */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { frameAnchorPoints } from '../../../geometry';
import { type Aabb2Scenario } from '@dirty-geometry/vec2/examples/aabb2/scenarios';

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
