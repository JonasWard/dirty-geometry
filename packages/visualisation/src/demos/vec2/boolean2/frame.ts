/** Frame fitting for the boolean2 demo: the points each scenario cell must show. */
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { frameAnchorPoints } from '../../../geometry';
import {
  type Boolean2Scenario,
  evaluateBooleanScenario,
  scenarioClips,
} from '@dirty-geometry/vec2/examples/boolean2/scenarios';

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
