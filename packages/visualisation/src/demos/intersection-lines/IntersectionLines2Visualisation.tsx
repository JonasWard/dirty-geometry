'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { LineLike2IntersectionResult } from '@dirty-geometry/vec2/operations/intersection/line2-like';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { angledIntersectionScenarios, evaluateIntersectionScenario, fixedIntersectionScenarios, randomIntersectionScenarios, type IntersectionScenario } from '@dirty-geometry/vec2/examples/intersection-lines/scenarios';
import { frameCorners, labelPosition, lineLikeKind, missMarkerPosition, vec2ToTuple } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { GeometryRender } from '../../geometry/components/GeometryRender';
import { fitGeometriesToFrame } from '../../geometry';

const intersectionScenarioRows = [
  fixedIntersectionScenarios,
  angledIntersectionScenarios,
  randomIntersectionScenarios,
] as const;

function IntersectionScenarioVisual({ scenario, offset }: { scenario: IntersectionScenario; offset: Vec2 }) {
  const result = useMemo(() => evaluateIntersectionScenario(scenario), [scenario]);
  const fit = useMemo(() => fitGeometriesToFrame([scenario.a, scenario.b]), [scenario.a, scenario.b]);

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      <GeometryRender geometry={scenario.a} fit={fit} offset={offset} color='#4da3ff' keyPrefix='a' lineWidth={2} />
      <GeometryRender geometry={scenario.b} fit={fit} offset={offset} color='#ffb347' keyPrefix='b' lineWidth={2} />

      {result?.type === 'Line2' || result?.type === 'Ray2' || result?.type === 'InfiniteLine2' ? (
        <GeometryRender geometry={result} fit={fit} offset={offset} color='#7dff7d' keyPrefix='overlap' lineWidth={3} />
      ) : null}

      {result?.type === 'Vec2' ? (
        <mesh position={vec2ToTuple(fit(result), offset)}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color='#7dff7d' />
        </mesh>
      ) : null}

      {result === null ? (
        <mesh position={missMarkerPosition(offset)}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color='#ff5c5c' />
        </mesh>
      ) : null}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-28 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {lineLikeKind(scenario.a)} × {lineLikeKind(scenario.b)}
          </div>
          <div className={result ? 'text-green-300' : 'text-red-300'}>{formatIntersectionResult(result)}</div>
        </div>
      </Html>
    </group>
  );
}

function formatIntersectionResult(result: LineLike2IntersectionResult): string {
  if (!result) return 'no intersection';
  if (result?.type === 'Vec2') return 'point';
  if (result?.type === 'Line2') return 'segment overlap';
  if (result?.type === 'Ray2') return 'ray overlap';
  return 'line overlap';
}

export function IntersectionLines2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={intersectionScenarioRows}
      renderCell={(scenario, offset) => <IntersectionScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default IntersectionLines2Visualisation;
