'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import {
  arcBooleanScenarioRows,
  evaluateArcBooleanScenario,
  type ArcBooleanScenario,
} from '@dirty-geometry/vec2/examples/arc-boolean2/scenarios';
import { frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { fitGeometriesToFrame } from '../../../geometry';
import { ContainerInteriorMesh } from '../../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../../geometry/components/GeometryRender';
import { arcChainDisplayPoints } from '../../../geometry/display/shared/arc';

const COLORS = {
  subject: '#ffb347',
  clip: '#c77dff',
  result: '#7dff7d',
  hole: '#ff7ad9',
  background: '#0b0d12',
} as const;

function ArcBooleanCell({ scenario, offset }: { scenario: ArcBooleanScenario; offset: Vec2 }) {
  const { result, fit } = useMemo(() => {
    const result = evaluateArcBooleanScenario(scenario);
    const geometries: Geometry2[] = [
      ...scenario.inputs,
      ...(scenario.clips ?? []),
      ...(result.regions ?? []),
      ...result.polygons,
    ];
    return { result, fit: fitGeometriesToFrame(geometries) };
  }, [scenario]);

  const regions = result.regions ?? [];
  const outer = regions.filter((region) => region.signedArea() > 0);
  const holes = regions.filter((region) => region.signedArea() < 0);
  const segments = regions.reduce((sum, region) => sum + region.segmentCount(), 0);
  const arcs = regions.reduce((sum, region) => sum + region.sagittas.filter((s) => s !== 0).length, 0);
  const area =
    regions.reduce((sum, region) => sum + region.signedArea(), 0) +
    result.polygons.reduce((sum, polygon) => sum + polygon.signedArea(), 0);
  const approximate = scenario.options?.arcs?.mode === 'approximate' ? scenario.options.arcs : null;
  const outline = (points: readonly Vec2[]) => points.map((point) => vec2ToTuple(fit(point), offset));

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
      {result.triMesh ? (
        <ContainerInteriorMesh
          container={result.triMesh}
          fit={fit}
          offset={offset}
          color={COLORS.result}
          opacity={0.22}
          z={-0.1}
          renderOrder={-2}
        />
      ) : null}

      {scenario.inputs.map((shape, index) => (
        <GeometryRender
          key={`input-${index}`}
          geometry={shape}
          fit={fit}
          offset={offset}
          color={COLORS.subject}
          keyPrefix={`input-${index}`}
          lineWidth={1}
        />
      ))}
      {(scenario.clips ?? []).map((clip, index) => (
        <GeometryRender
          key={`clip-${index}`}
          geometry={clip}
          fit={fit}
          offset={offset}
          color={COLORS.clip}
          keyPrefix={`clip-${index}`}
          lineWidth={1}
        />
      ))}

      {regions.map((region, index) => (
        <group key={`region-${index}`}>
          <Line
            points={outline(arcChainDisplayPoints(region.segments(), true))}
            color={region.signedArea() > 0 ? COLORS.result : COLORS.hole}
            lineWidth={2.25}
          />
          {region.vertices.map((vertex, v) => (
            <mesh key={v} position={vec2ToTuple(fit(vertex), offset)}>
              <circleGeometry args={[0.03, 12]} />
              <meshBasicMaterial color={region.signedArea() > 0 ? COLORS.result : COLORS.hole} />
            </mesh>
          ))}
        </group>
      ))}
      {result.polygons.map((polygon, index) => (
        <Line
          key={`polygon-${index}`}
          points={outline([...polygon.vertices, polygon.vertices[0]!])}
          color={COLORS.result}
          lineWidth={2.25}
        />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {scenario.section} · area {area.toFixed(3)}
          </div>
          <div className='text-green-300'>
            {approximate
              ? `approximate ${approximate.chordTolerance} · ${result.polygons.length} loop(s) · ${result.triMesh?.triangles.length ?? 0} tris`
              : `${outer.length} region(s) · ${holes.length} hole(s) · ${segments} segments, ${arcs} arcs`}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function ArcBoolean2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={arcBooleanScenarioRows}
      renderCell={(scenario, offset) => <ArcBooleanCell scenario={scenario} offset={offset} />}
    />
  );
}

export default ArcBoolean2Visualisation;
