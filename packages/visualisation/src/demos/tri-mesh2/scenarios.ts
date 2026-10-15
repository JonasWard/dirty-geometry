import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import {
  annulusMesh,
  buildingYardMesh,
  hPlateMesh,
  lWingMesh,
  squareMesh,
  swissCheeseMesh,
} from '@dirty-geometry/vec2/examples/tri-mesh2/meshes';

export type TriMesh2ContainmentScenario = {
  name: string;
  mesh: TriMesh2;
  slack: Epsilon;
  slackLabel: string;
  sampleMin: number;
  sampleMax: number;
  sampleStep: number;
};

type SampleBounds = {
  sampleMin: number;
  sampleMax: number;
  sampleStep: number;
};

function epsilonScenarioRow(label: string, mesh: TriMesh2, sample: SampleBounds): TriMesh2ContainmentScenario[] {
  return [
    {
      name: `${label} · preferIn`,
      mesh,
      slack: Epsilon.preferIn,
      slackLabel: 'preferIn',
      ...sample,
    },
    {
      name: `${label} · preferOut`,
      mesh,
      slack: Epsilon.preferOut,
      slackLabel: 'preferOut',
      ...sample,
    },
    {
      name: `${label} · ε = 0.08`,
      mesh,
      slack: Epsilon.custom(0.08),
      slackLabel: 'ε = 0.08',
      ...sample,
    },
    {
      name: `${label} · ε = −0.08`,
      mesh,
      slack: Epsilon.custom(-0.08),
      slackLabel: 'ε = −0.08',
      ...sample,
    },
  ];
}

const annulusSample = { sampleMin: -0.2, sampleMax: 3.2, sampleStep: 0.28 };
const squareSample = { sampleMin: -0.15, sampleMax: 1.15, sampleStep: 0.13 };
const swissCheeseSample = { sampleMin: -0.4, sampleMax: 10.4, sampleStep: 0.55 };
const lWingSample = { sampleMin: -0.4, sampleMax: 9.4, sampleStep: 0.55 };
const buildingYardSample = { sampleMin: -0.6, sampleMax: 18.6, sampleStep: 0.85 };
const hPlateSample = { sampleMin: -0.5, sampleMax: 12.5, sampleStep: 0.65 };

export const triMesh2AnnulusEpsilonScenarios = epsilonScenarioRow('Annulus', annulusMesh(), annulusSample);
export const triMesh2SquareEpsilonScenarios = epsilonScenarioRow('Square', squareMesh(), squareSample);
export const triMesh2SwissCheeseEpsilonScenarios = epsilonScenarioRow(
  'Swiss cheese',
  swissCheeseMesh(),
  swissCheeseSample,
);
export const triMesh2LWingEpsilonScenarios = epsilonScenarioRow('L-wing', lWingMesh(), lWingSample);
export const triMesh2BuildingYardEpsilonScenarios = epsilonScenarioRow(
  'Building yard',
  buildingYardMesh(),
  buildingYardSample,
);
export const triMesh2HPlateEpsilonScenarios = epsilonScenarioRow('H-plate', hPlateMesh(), hPlateSample);

export { annulusMesh } from '@dirty-geometry/vec2/examples/tri-mesh2/meshes';

export function sampleGridPoints(min: number, max: number, step: number): Vec2[] {
  const points: Vec2[] = [];

  for (let x = min; x <= max + step * 0.5; x += step) {
    for (let y = min; y <= max + step * 0.5; y += step) {
      points.push(new Vec2(x, y));
    }
  }

  return points;
}

export function scenarioAnchorPoints(scenario: TriMesh2ContainmentScenario): Vec2[] {
  return [...scenario.mesh.vertices, ...sampleGridPoints(scenario.sampleMin, scenario.sampleMax, scenario.sampleStep)];
}
