'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { aabb2FiniteScenarios, aabb2UnionScenarios, aabb2UnboundedScenarios, evaluateAabbScenario, formatAabb, geometryKind, type Aabb2Scenario } from '@dirty-geometry/vec2/examples/aabb2/scenarios';
import { scenarioAnchorPoints } from './frame';
import { GeometryRender } from '../../geometry/components/GeometryRender';
import { aabbDisplayOutlinePoints } from '../../geometry';
import { fitPointsToFrame, frameCorners, labelPosition } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';

const aabb2ScenarioRows = [aabb2FiniteScenarios, aabb2UnboundedScenarios, aabb2UnionScenarios] as const;

const GEOMETRY_COLOR = '#ffb347';
const AABB_COLOR = '#7dff7d';

function Aabb2ScenarioVisual({ scenario, offset }: { scenario: Aabb2Scenario; offset: Vec2 }) {
  const definitionGeometry = scenario.definitionGeometry ?? false;
  const fit = useMemo(() => fitPointsToFrame(scenarioAnchorPoints(scenario)), [scenario]);
  const box = useMemo(() => evaluateAabbScenario(scenario), [scenario]);

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {scenario.unionItems
        ? scenario.unionItems.map((item, index) =>
            item.type === 'Vec2' ? (
              <GeometryRender
                key={`point-${index}`}
                geometry={item}
                fit={fit}
                offset={offset}
                color={GEOMETRY_COLOR}
                keyPrefix={`point-${index}`}
                pointRadius={0.06}
              />
            ) : (
              <GeometryRender
                key={`geom-${index}`}
                geometry={item}
                fit={fit}
                offset={offset}
                color={GEOMETRY_COLOR}
                keyPrefix={`geom-${index}`}
                definitionGeometry={definitionGeometry}
              />
            ),
          )
        : scenario.geometry
          ? [
              <GeometryRender
                key='geometry'
                geometry={scenario.geometry}
                fit={fit}
                offset={offset}
                color={GEOMETRY_COLOR}
                definitionGeometry={definitionGeometry}
              />,
            ]
          : null}

      <Line points={aabbDisplayOutlinePoints(box, fit, offset)} color={AABB_COLOR} lineWidth={2.5} />

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-36 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {scenario.unionItems ? `union(${scenario.unionItems.length})` : geometryKind(scenario.geometry!)}
            {definitionGeometry ? ' · definition' : ''}
          </div>
          <div className='text-green-300/90'>{formatAabb(box)}</div>
        </div>
      </Html>
    </group>
  );
}

export function Aabb2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={aabb2ScenarioRows}
      renderCell={(scenario, offset) => <Aabb2ScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default Aabb2Visualisation;
