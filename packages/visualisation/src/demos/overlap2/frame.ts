/** Frame fitting for the overlap2 demo: the points each scenario cell must show. */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { frameAnchorPoints } from '../../geometry';
import { type Overlap2Scenario } from '@dirty-geometry/vec2/examples/overlap2/scenarios';

/** Collect world-space points used to fit each scenario into its frame cell. */
export function scenarioAnchorPoints(scenario: Overlap2Scenario): Vec2[] {
  return frameAnchorPoints([scenario.a, scenario.b]);
}
