'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { GeometryRender } from '../../geometry/components/GeometryRender';
import { createContainerFill } from '../../geometry/display/interior';
import { fitGeometriesToFrame } from '../../geometry';
import { frameCorners, labelPosition } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';
import { boolean2IntersectPolygonScenarios, boolean2IntersectScenarios, boolean2ManyIntersectScenarios, boolean2ManySubtractScenarios, boolean2SubtractPolygonScenarios, boolean2SubtractScenarios, boolean2UnionScenarios, evaluateBooleanScenario, scenarioClips, type Boolean2Scenario } from '@dirty-geometry/vec2/examples/boolean2/scenarios';

export const boolean2VisualisationMeta: VisualisationMeta = {
  id: 'boolean2',
  label: 'Boolean2',
  title: 'Boolean2',
  description:
    'Orange = subject polygons. Purple = clip (half-plane line or polygon). Green = boolean result (filtered CDT mesh). Union merges via non-zero winding; intersect / subtract clip against one or many half-planes and/or polygons.',
  legend: [
    { color: '#ffb347', label: 'Subject polygon', shape: 'line' },
    { color: '#c77dff', label: 'Clip geometry', shape: 'line' },
    { color: '#7dff7d', label: 'Result interior' },
  ],
};

const boolean2ScenarioRows = [
  boolean2UnionScenarios,
  boolean2IntersectScenarios,
  boolean2SubtractScenarios,
  boolean2IntersectPolygonScenarios,
  boolean2ManyIntersectScenarios,
  boolean2SubtractPolygonScenarios,
  boolean2ManySubtractScenarios,
] as const;

const INPUT_COLOR = '#ffb347';
const CLIP_COLOR = '#c77dff';

function ResultInteriorMesh({
  mesh,
  fit,
  offset,
}: {
  mesh: NonNullable<ReturnType<typeof evaluateBooleanScenario>['triMesh']>;
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
}) {
  const fill = useMemo(() => createContainerFill(mesh, { fit, offset }), [mesh, fit, offset]);
  if (!fill) return null;

  return (
    <mesh position={[offset.x, offset.y, -0.1]} renderOrder={-1}>
      <primitive object={fill.geometry} attach='geometry' />
      <meshBasicMaterial color='#7dff7d' transparent opacity={0.25} depthWrite={false} />
    </mesh>
  );
}

function Boolean2ScenarioVisual({ scenario, offset }: { scenario: Boolean2Scenario; offset: Vec2 }) {
  const result = useMemo(() => evaluateBooleanScenario(scenario), [scenario]);
  const fit = useMemo(
    () =>
      fitGeometriesToFrame([
        ...scenario.inputs,
        ...scenarioClips(scenario),
        ...(result.triMesh ? [result.triMesh] : result.polygons),
      ]),
    [scenario, result],
  );

  return (
    <group>
      {result.triMesh ? <ResultInteriorMesh mesh={result.triMesh} fit={fit} offset={offset} /> : null}

      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {scenario.inputs.map((polygon, index) => (
        <GeometryRender
          key={`input-${index}`}
          geometry={polygon}
          fit={fit}
          offset={offset}
          color={INPUT_COLOR}
          keyPrefix={`input-${index}`}
          lineWidth={1.75}
        />
      ))}

      {scenarioClips(scenario).map((clip, index) => (
        <GeometryRender
          key={`clip-${index}`}
          geometry={clip}
          fit={fit}
          offset={offset}
          color={CLIP_COLOR}
          keyPrefix={`clip-${index}`}
          lineWidth={2.5}
        />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-32 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{scenario.section}</div>
          <div className='text-green-300'>
            {result.polygons.length} loop{result.polygons.length === 1 ? '' : 's'}
            {result.triMesh ? ` · ${result.triMesh.triangles.length} tris` : ''}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function Boolean2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={boolean2ScenarioRows}
      renderCell={(scenario, offset) => <Boolean2ScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default Boolean2Visualisation;
