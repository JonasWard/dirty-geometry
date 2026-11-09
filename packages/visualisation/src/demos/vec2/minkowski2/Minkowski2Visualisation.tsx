'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { ArcPolygon2 } from '@dirty-geometry/vec2/geometry/regions/arc-polygon2';
import {
  evaluateMinkowskiScenario,
  minkowskiScenarioRows,
  type Minkowski2Scenario,
} from '@dirty-geometry/vec2/examples/minkowski2/scenarios';
import { frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { fitGeometriesToFrame } from '../../../geometry';
import { ContainerInteriorMesh } from '../../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../../geometry/components/GeometryRender';
import { arcChainDisplayPoints, displayChordTolerance } from '../../../geometry/display/shared/arc';

const COLORS = {
  a: '#ffb347',
  b: '#c77dff',
  result: '#7dff7d',
  hole: '#ff7ad9',
  background: '#0b0d12',
} as const;

function MinkowskiCell({ scenario, offset }: { scenario: Minkowski2Scenario; offset: Vec2 }) {
  const { regions, fit, milliseconds } = useMemo(() => {
    const start = performance.now();
    const result = evaluateMinkowskiScenario(scenario);
    const milliseconds = performance.now() - start;
    // Straight results are drawn the same way as arc results.
    const regions = [...(result.regions ?? []), ...result.polygons.map((p) => ArcPolygon2.fromPolygon(p))];
    const geometries: Geometry2[] = [...scenario.a, ...(scenario.b ?? []), ...regions];
    return { regions, fit: fitGeometriesToFrame(geometries), milliseconds };
  }, [scenario]);

  const outer = regions.filter((region) => region.signedArea() > 0);
  const holes = regions.filter((region) => region.signedArea() < 0);
  const area = regions.reduce((sum, region) => sum + region.signedArea(), 0);
  const outline = (points: readonly Vec2[]) => points.map((point) => vec2ToTuple(fit(point), offset));
  const detail = scenario.section === 'disc' ? `r ${scenario.radius}` : scenario.section;

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {/* Result interiors, then holes painted over in the background colour. */}
      {outer.map((region, index) => (
        <ContainerInteriorMesh
          key={`fill-${index}`}
          container={region}
          fit={fit}
          offset={offset}
          color={COLORS.result}
          opacity={0.22}
          z={-0.1}
          renderOrder={-2}
        />
      ))}
      {holes.map((region, index) => (
        <ContainerInteriorMesh
          key={`hole-${index}`}
          container={region}
          fit={fit}
          offset={offset}
          color={COLORS.background}
          opacity={1}
          z={-0.09}
          renderOrder={-1}
        />
      ))}

      {scenario.a.map((shape, index) => (
        <GeometryRender
          key={`a-${index}`}
          geometry={shape}
          fit={fit}
          offset={offset}
          color={COLORS.a}
          keyPrefix={`a-${index}`}
          lineWidth={1}
        />
      ))}
      {(scenario.b ?? []).map((shape, index) => (
        <GeometryRender
          key={`b-${index}`}
          geometry={shape}
          fit={fit}
          offset={offset}
          color={COLORS.b}
          keyPrefix={`b-${index}`}
          lineWidth={1}
        />
      ))}

      {regions.map((region, index) => (
        <Line
          key={`region-${index}`}
          points={outline(arcChainDisplayPoints(region.segments(), true, displayChordTolerance(fit)))}
          color={region.signedArea() > 0 ? COLORS.result : COLORS.hole}
          lineWidth={2.25}
        />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {detail} · area {area.toFixed(3)} · {milliseconds.toFixed(1)} ms
          </div>
          <div className='text-green-300'>
            {outer.length} region(s) · {holes.length} hole(s)
          </div>
        </div>
      </Html>
    </group>
  );
}

export function Minkowski2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={minkowskiScenarioRows}
      renderCell={(scenario, offset) => <MinkowskiCell scenario={scenario} offset={offset} />}
    />
  );
}

export default Minkowski2Visualisation;
