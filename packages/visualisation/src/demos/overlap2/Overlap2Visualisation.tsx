'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { isContainer2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { evaluateOverlapScenario, geometryKind, overlap2BoxScenarios, overlap2CircleScenarios, overlap2CurveScenarios, overlap2HalfPlaneScenarios, overlap2PolylineScenarios, overlap2RegionScenarios, overlap2TouchingScenarios, type Overlap2Scenario } from '@dirty-geometry/vec2/examples/overlap2/scenarios';
import { ContainerInteriorMesh } from '../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../geometry/components/GeometryRender';
import { fitGeometriesToFrame } from '../../geometry';
import { frameCorners, labelPosition, missMarkerPosition } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';

export const overlap2VisualisationMeta: VisualisationMeta = {
  id: 'overlap2',
  label: 'Overlap2',
  title: 'Overlap2',
  description:
    'Blue and orange are the two geometries under test. Green label = overlap; red = disjoint. Last row pairs preferIn (touch counts) vs preferOut (strict interior only) for boundary contact.',
  legend: [
    { color: '#4da3ff', label: 'Geometry A', shape: 'line' },
    { color: '#ffb347', label: 'Geometry B', shape: 'line' },
    { color: '#7dff7d', label: 'Overlaps' },
    { color: '#ff5c5c', label: 'Disjoint' },
  ],
};

const overlap2ScenarioRows = [
  overlap2CurveScenarios,
  overlap2RegionScenarios,
  overlap2CircleScenarios,
  overlap2HalfPlaneScenarios,
  overlap2BoxScenarios,
  overlap2PolylineScenarios,
  overlap2TouchingScenarios,
] as const;

const COLOR_A = '#4da3ff';
const COLOR_B = '#ffb347';

function Overlap2ScenarioVisual({ scenario, offset }: { scenario: Overlap2Scenario; offset: Vec2 }) {
  const overlaps = useMemo(() => evaluateOverlapScenario(scenario), [scenario]);
  const fit = useMemo(() => fitGeometriesToFrame([scenario.a, scenario.b]), [scenario.a, scenario.b]);
  const slack = scenario.slack ?? Epsilon.preferIn;

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {isContainer2(scenario.a) ? <ContainerInteriorMesh container={scenario.a} fit={fit} offset={offset} /> : null}
      {isContainer2(scenario.b) ? <ContainerInteriorMesh container={scenario.b} fit={fit} offset={offset} /> : null}

      <GeometryRender geometry={scenario.a} fit={fit} offset={offset} color={COLOR_A} keyPrefix='a' lineWidth={2.5} />
      <GeometryRender geometry={scenario.b} fit={fit} offset={offset} color={COLOR_B} keyPrefix='b' />

      {!overlaps ? (
        <mesh position={missMarkerPosition(offset)}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color='#ff5c5c' />
        </mesh>
      ) : null}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-32 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {geometryKind(scenario.a)} ∩ {geometryKind(scenario.b)}
          </div>
          <div className={overlaps ? 'text-green-300' : 'text-red-300'}>
            {overlaps ? 'overlap' : 'disjoint'}
            {slack.value < 0 ? ' · strict' : ''}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function Overlap2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={overlap2ScenarioRows}
      renderCell={(scenario, offset) => <Overlap2ScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default Overlap2Visualisation;
