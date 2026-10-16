/** Frame fitting for the tri-mesh2 demo: the points each scenario cell must show. */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { type TriMesh2ContainmentScenario, sampleGridPoints } from '@dirty-geometry/vec2/examples/tri-mesh2/scenarios';

export function scenarioAnchorPoints(scenario: TriMesh2ContainmentScenario): Vec2[] {
  return [...scenario.mesh.vertices, ...sampleGridPoints(scenario.sampleMin, scenario.sampleMax, scenario.sampleStep)];
}
