/** Frame fitting for the contains2 demo: the points each scenario cell must show. */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { frameAnchorPoints } from '../../../geometry';
import { type Contains2Scenario } from '@dirty-geometry/vec2/examples/contains2/scenarios';

/** Collect world-space points used to fit each scenario into its frame cell. */
export function scenarioAnchorPoints(scenario: Contains2Scenario): Vec2[] {
  return frameAnchorPoints([scenario.container, scenario.guest]);
}
