'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { contains2CircleScenarios, contains2ComplexMeshScenarios, contains2ComplexMeshGuestScenarios, contains2CurveScenarios, contains2MeshScenarios, contains2PointScenarios, contains2SegmentScenarios, contains2UnboundedScenarios, containerKind, evaluateContainsScenario, guestKind, type Contains2Scenario } from '@dirty-geometry/vec2/examples/contains2/scenarios';
import { ContainerInteriorMesh } from '../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../geometry/components/GeometryRender';
import { frameCorners, labelPosition, vec2ToTuple } from '../../core/frame';
import { fitGeometriesToFrame } from '../../geometry';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';

export const contains2VisualisationMeta: VisualisationMeta = {
  id: 'contains2',
  label: 'Contains2',
  title: 'Contains2',
  description:
    'Translucent blue = container interior. Guest geometry in orange; query points are green (inside) or red (outside). Rows: points → segments → circles → curves → unbounded → meshes → complex mesh containers → complex mesh guests (circle, polygon, half-plane).',
  legend: [
    { color: '#4da3ff', label: 'Container interior' },
    { color: '#ffb347', label: 'Guest', shape: 'line' },
    { color: '#7dff7d', label: 'Point inside' },
    { color: '#ff5c5c', label: 'Point outside' },
  ],
};

const contains2ScenarioRows = [
  contains2PointScenarios,
  contains2SegmentScenarios,
  contains2CircleScenarios,
  contains2CurveScenarios,
  contains2UnboundedScenarios,
  contains2MeshScenarios,
  contains2ComplexMeshScenarios,
  contains2ComplexMeshGuestScenarios,
] as const;

const CONTAINER_COLOR = '#4da3ff';
const GUEST_COLOR = '#ffb347';
const INSIDE_COLOR = '#7dff7d';
const OUTSIDE_COLOR = '#ff5c5c';

function Contains2ScenarioVisual({ scenario, offset }: { scenario: Contains2Scenario; offset: Vec2 }) {
  const inside = evaluateContainsScenario(scenario);
  const fit = useMemo(
    () => fitGeometriesToFrame([scenario.container, scenario.guest]),
    [scenario.container, scenario.guest],
  );
  const slack = scenario.slack ?? Epsilon.preferIn;

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      <ContainerInteriorMesh container={scenario.container} fit={fit} offset={offset} />
      <GeometryRender
        geometry={scenario.container}
        fit={fit}
        offset={offset}
        color={CONTAINER_COLOR}
        keyPrefix='container'
        lineWidth={2.5}
      />

      {scenario.guest.type === 'Vec2' ? (
        <mesh key='guest-point' position={vec2ToTuple(fit(scenario.guest), offset)}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={inside ? INSIDE_COLOR : OUTSIDE_COLOR} />
        </mesh>
      ) : (
        <GeometryRender geometry={scenario.guest} fit={fit} offset={offset} color={GUEST_COLOR} keyPrefix='guest' />
      )}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-32 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {containerKind(scenario.container)} ⊃ {guestKind(scenario.guest)}
          </div>
          <div className={inside ? 'text-green-300' : 'text-red-300'}>
            {inside ? 'inside' : 'outside'}
            {slack.value < 0 ? ' · strict' : ''}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function Contains2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={contains2ScenarioRows}
      renderCell={(scenario, offset) => <Contains2ScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default Contains2Visualisation;
