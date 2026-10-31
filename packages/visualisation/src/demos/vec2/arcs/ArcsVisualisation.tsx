'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Arc2 } from '@dirty-geometry/vec2/geometry/primitives/arc2';
import type { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { arcScenarioRows, type ArcGeometry, type ArcScenario } from '@dirty-geometry/vec2/examples/arcs/scenarios';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { ContainerInteriorMesh } from '../../../geometry/components/ContainerInteriorMesh';
import { arcChainDisplayPoints } from '../../../geometry/display/shared/arc';

const COLORS = {
  curve: '#4da3ff',
  offset: '#ffb347',
  chord: '#6b7280',
  apex: '#ff7ad9',
  centre: '#8a8f99',
  sample: '#5ce1ff',
  query: '#ff5c5c',
  closest: '#7dff7d',
} as const;

function segmentsOf(geometry: ArcGeometry): (Line2 | Arc2)[] {
  return geometry.type === 'Arc2' ? [geometry] : geometry.segments();
}

function offsetOf(geometry: ArcGeometry, distance: number, miterLimit?: number): ArcGeometry | null {
  try {
    return geometry.type === 'Arc2' ? geometry.offset(distance) : geometry.offset(distance, { miterLimit });
  } catch {
    return null; // a collapsing arc: nothing to draw
  }
}

function describe(geometry: ArcGeometry, query?: Vec2): string[] {
  const lines = [`${geometry.type} · k=${segmentsOf(geometry).length} · L=${geometry.length().toFixed(2)}`];
  if (geometry.type === 'ArcPolygon2') {
    lines.push(
      `area ${geometry.area().toFixed(2)}${query ? ` · query ${geometry.containsPoint(query) ? 'in' : 'out'}` : ''}`,
    );
  } else if (geometry.type === 'ArcPolyline2' && query) {
    lines.push(`query ${['right', 'on', 'left'][geometry.sideOfPoint(query) + 1]}`);
  } else if (geometry.type === 'Arc2') {
    lines.push(`s=${geometry.sagitta.toFixed(2)} · r=${geometry.radius().toFixed(2)}`);
  }
  return lines;
}

function Dot({ at, color, radius, offset }: { at: Vec2; color: string; radius: number; offset: Vec2 }) {
  return (
    <mesh position={vec2ToTuple(at, offset)}>
      <circleGeometry args={[radius, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function ArcScenarioVisual({ scenario, offset }: { scenario: ArcScenario; offset: Vec2 }) {
  const scene = useMemo(() => {
    const geometry = scenario.build();
    const closed = geometry.type === 'ArcPolygon2';
    const curve = arcChainDisplayPoints(segmentsOf(geometry), closed);
    const offsets = (scenario.offsets ?? [])
      .map((distance) => offsetOf(geometry, distance, scenario.miterLimit))
      .filter((value): value is ArcGeometry => value !== null)
      .map((value) => arcChainDisplayPoints(segmentsOf(value), value.type === 'ArcPolygon2'));
    const arcs = segmentsOf(geometry).filter((segment): segment is Arc2 => segment.type === 'Arc2');
    const samples = (scenario.lengthSamples ?? []).map((length) => geometry.evaluateAtLength(length));
    const closest = scenario.query ? geometry.closestPointForPoint(scenario.query) : null;

    const fit = fitPointsToFrame([
      ...curve,
      ...(scenario.guides ?? []).flat(),
      ...offsets.flat(),
      ...arcs.map((arc) => arc.apex()),
      ...(scenario.query ? [scenario.query] : []),
    ]);
    return { geometry, curve, offsets, arcs, samples, closest, fit };
  }, [scenario]);

  const { geometry, curve, offsets, arcs, samples, closest, fit } = scene;
  const line = (points: readonly Vec2[]) => points.map((point) => vec2ToTuple(fit(point), offset));

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {geometry.type === 'ArcPolygon2' ? (
        <ContainerInteriorMesh container={geometry} fit={fit} offset={offset} color={COLORS.curve} />
      ) : null}

      {(scenario.guides ?? []).map((guide, index) => (
        <Line key={`guide-${index}`} points={line(guide)} color={COLORS.chord} lineWidth={1} />
      ))}

      {arcs.map((arc, index) => (
        <group key={`arc-${index}`}>
          <Line
            points={line([arc.from, arc.to])}
            color={COLORS.chord}
            lineWidth={1}
            dashed
            dashSize={0.06}
            gapSize={0.05}
          />
          <Dot at={fit(arc.apex())} color={COLORS.apex} radius={0.04} offset={offset} />
          <Dot at={fit(arc.centre())} color={COLORS.centre} radius={0.025} offset={offset} />
        </group>
      ))}

      {offsets.map((points, index) => (
        <Line key={`offset-${index}`} points={line(points)} color={COLORS.offset} lineWidth={1.5} />
      ))}

      <Line points={line(curve)} color={COLORS.curve} lineWidth={2.5} />

      {samples.map((point, index) => (
        <Dot key={`sample-${index}`} at={fit(point)} color={COLORS.sample} radius={0.045} offset={offset} />
      ))}

      {scenario.query && closest ? (
        <>
          <Line points={line([scenario.query, closest])} color={COLORS.closest} lineWidth={1} />
          <Dot at={fit(scenario.query)} color={COLORS.query} radius={0.055} offset={offset} />
          <Dot at={fit(closest)} color={COLORS.closest} radius={0.05} offset={offset} />
        </>
      ) : null}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          {describe(geometry, scenario.query).map((text) => (
            <div key={text} className='text-white/70'>
              {text}
            </div>
          ))}
        </div>
      </Html>
    </group>
  );
}

export function ArcsVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={arcScenarioRows}
      columns={5}
      renderCell={(scenario, offset) => <ArcScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default ArcsVisualisation;
