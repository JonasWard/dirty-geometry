'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import {
  sampleGridPoints,
  triMesh2AnnulusEpsilonScenarios,
  triMesh2BuildingYardEpsilonScenarios,
  triMesh2HPlateEpsilonScenarios,
  triMesh2LWingEpsilonScenarios,
  triMesh2SquareEpsilonScenarios,
  triMesh2SwissCheeseEpsilonScenarios,
  type TriMesh2ContainmentScenario,
} from '@dirty-geometry/vec2/examples/tri-mesh2/scenarios';
import { scenarioAnchorPoints } from './frame';
import { ContainerInteriorMesh } from '../../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../../geometry/components/GeometryRender';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';

const triMesh2ScenarioRows = [
  triMesh2AnnulusEpsilonScenarios,
  triMesh2SquareEpsilonScenarios,
  triMesh2SwissCheeseEpsilonScenarios,
  triMesh2LWingEpsilonScenarios,
  triMesh2BuildingYardEpsilonScenarios,
  triMesh2HPlateEpsilonScenarios,
] as const;

const MESH_COLOR = '#4da3ff';
const INSIDE_COLOR = '#7dff7d';
const OUTSIDE_COLOR = '#ff5c5c';
const POINT_RADIUS = 0.045;

function TriMesh2ScenarioVisual({ scenario, offset }: { scenario: TriMesh2ContainmentScenario; offset: Vec2 }) {
  const fit = useMemo(() => fitPointsToFrame(scenarioAnchorPoints(scenario)), [scenario]);
  const samples = useMemo(
    () => sampleGridPoints(scenario.sampleMin, scenario.sampleMax, scenario.sampleStep),
    [scenario.sampleMin, scenario.sampleMax, scenario.sampleStep],
  );
  const boundaryLoops = useMemo(() => scenario.mesh.boundaryLoops(), [scenario.mesh]);
  const loopPolygons = useMemo(() => boundaryLoops.map((loop) => loop.polygon), [boundaryLoops]);
  const classified = useMemo(
    () =>
      samples.map((point) => ({
        point,
        inside:
          loopPolygons.length > 0
            ? Polygon2.isPointInside(loopPolygons, point, scenario.slack)
            : scenario.mesh.containsPoint(point, scenario.slack),
      })),
    [samples, loopPolygons, scenario.mesh, scenario.slack],
  );

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      <ContainerInteriorMesh container={scenario.mesh} fit={fit} offset={offset} />
      <GeometryRender
        geometry={scenario.mesh}
        fit={fit}
        offset={offset}
        color={MESH_COLOR}
        keyPrefix='mesh'
        lineWidth={2}
      />

      {boundaryLoops.map((loop, index) => {
        const loopPoints = loop.polygon.vertices.map((vertex) => vec2ToTuple(fit(vertex), offset));
        if (loopPoints.length > 0) {
          loopPoints.push(loopPoints[0]!);
        }

        return <Line key={`loop-${index}`} points={loopPoints} color='#c77dff' lineWidth={2.5} />;
      })}

      {classified.map(({ point, inside }, index) => (
        <mesh key={`sample-${index}`} position={vec2ToTuple(fit(point), offset)}>
          <sphereGeometry args={[POINT_RADIUS, 8, 8]} />
          <meshBasicMaterial color={inside ? INSIDE_COLOR : OUTSIDE_COLOR} />
        </mesh>
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-36 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>slack: {scenario.slackLabel}</div>
          <div className='text-white/50'>
            {classified.filter((sample) => sample.inside).length}/{classified.length} inside
          </div>
        </div>
      </Html>
    </group>
  );
}

export function TriMesh2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={triMesh2ScenarioRows}
      renderCell={(scenario, offset) => <TriMesh2ScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default TriMesh2Visualisation;
