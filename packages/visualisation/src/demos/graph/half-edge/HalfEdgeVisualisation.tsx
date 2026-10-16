'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  evaluateHalfEdge,
  halfEdgeScenarios,
  type HalfEdgeScenario,
} from '@dirty-geometry/graph/examples/half-edge/scenarios';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { HALF_EDGE_COLORS } from './colors';

const rows = [halfEdgeScenarios] as const;

const lerp = (a: Vec2, b: Vec2, t: number) => new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** Arrow for a half-edge, pulled towards its face's centre so the two sides of an edge stay apart. */
function arrowPoints(from: Vec2, to: Vec2, centre: Vec2): { shaft: [Vec2, Vec2]; head: [Vec2, Vec2, Vec2] } {
  const a = lerp(lerp(from, centre, 0.16), lerp(to, centre, 0.16), 0.12);
  const b = lerp(lerp(from, centre, 0.16), lerp(to, centre, 0.16), 0.88);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  const size = Math.min(0.12, length * 0.3);
  const left = new Vec2(b.x - ux * size - uy * size * 0.6, b.y - uy * size + ux * size * 0.6);
  const right = new Vec2(b.x - ux * size + uy * size * 0.6, b.y - uy * size - ux * size * 0.6);
  return { shaft: [a, b], head: [left, b, right] };
}

function HalfEdgeCell({ scenario, offset }: { scenario: HalfEdgeScenario; offset: Vec2 }) {
  const result = useMemo(() => evaluateHalfEdge(scenario), [scenario]);
  const fit = useMemo(() => fitPointsToFrame(result.vertices), [result]);
  const placed = useMemo(() => result.vertices.map((vertex) => fit(vertex)), [result, fit]);
  const centres = useMemo(
    () =>
      result.faces.map((face) => {
        const sum = face.reduce(
          (acc, index) => new Vec2(acc.x + placed[index]!.x, acc.y + placed[index]!.y),
          new Vec2(0, 0),
        );
        return new Vec2(sum.x / face.length, sum.y / face.length);
      }),
    [result, placed],
  );
  const tuple = (point: Vec2, z = 0): [number, number, number] => {
    const [x, y] = vec2ToTuple(point, offset);
    return [x, y, z];
  };

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {result.faces.map((face, index) => (
        <Line
          key={`face-${index}`}
          points={[...face, face[0]!].map((vertex) => tuple(placed[vertex]!))}
          color={HALF_EDGE_COLORS.face}
          lineWidth={1}
        />
      ))}

      {result.halfEdges.map((edge, index) => {
        const { shaft, head } = arrowPoints(placed[edge.origin]!, placed[edge.destination]!, centres[edge.face]!);
        const color =
          edge.fanIndex !== null
            ? HALF_EDGE_COLORS.fan
            : edge.boundary
              ? HALF_EDGE_COLORS.boundary
              : HALF_EDGE_COLORS.interior;
        const width = edge.fanIndex !== null ? 3 : 1.5;
        return (
          <group key={`he-${index}`}>
            <Line points={shaft.map((point) => tuple(point, 0.01))} color={color} lineWidth={width} />
            <Line points={head.map((point) => tuple(point, 0.01))} color={color} lineWidth={width} />
          </group>
        );
      })}

      {result.halfEdges
        .filter((edge) => edge.fanIndex !== null)
        .map((edge) => {
          const { shaft } = arrowPoints(placed[edge.origin]!, placed[edge.destination]!, centres[edge.face]!);
          return (
            <Html
              key={`fan-${edge.fanIndex}`}
              center
              position={tuple(lerp(shaft[0], shaft[1], 0.5), 0.02)}
              style={{ pointerEvents: 'none' }}
            >
              <div className='rounded-full bg-black/80 px-1 text-[8px] font-semibold text-green-300'>
                {edge.fanIndex}
              </div>
            </Html>
          );
        })}

      {placed.map((point, index) => (
        <mesh key={`v-${index}`} position={tuple(point, 0.03)}>
          <circleGeometry args={[index === scenario.pick ? 0.09 : 0.05, 20]} />
          <meshBasicMaterial color={index === scenario.pick ? HALF_EDGE_COLORS.pick : HALF_EDGE_COLORS.vertex} />
        </mesh>
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='w-max max-w-56 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{result.summary}</div>
          <div className='text-green-300/90'>
            iterateVertex({scenario.pick}) → {result.fan.join(', ')}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function HalfEdgeVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={rows}
      renderCell={(scenario, offset) => <HalfEdgeCell scenario={scenario} offset={offset} />}
    />
  );
}

export default HalfEdgeVisualisation;
