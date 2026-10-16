'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  specPoints,
  type GraphScenarioResult,
  type GraphSpec,
  type NodeMarkerKind,
} from '@dirty-geometry/graph/examples/shared';
import { GRAPH_LEGEND_COLORS } from './legend-colors';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';

const C = GRAPH_LEGEND_COLORS;
export const GRAPH_COLORS = {
  edge: C.edge,
  input: C.input,
  result: C.result,
  blocked: C.blocked,
  node: C.node,
  groups: C.groups,
  markers: {
    start: C.start,
    goal: C.goal,
    via: C.via,
    leaf: C.leaf,
    junction: C.junction,
  } satisfies Record<NodeMarkerKind, string>,
} as const;

/** One scenario card: the graph faint, the input subset, colour groups, the result and node markers. */
export function GraphResultCell({
  name,
  spec,
  result,
  offset,
}: {
  name: string;
  spec: GraphSpec;
  result: GraphScenarioResult;
  offset: Vec2;
}) {
  const fit = useMemo(() => fitPointsToFrame(specPoints(spec)), [spec]);
  const position = useMemo(() => {
    const placed = new Map<string, Vec2>();
    for (const [id, [x, y]] of Object.entries(spec.nodes)) placed.set(id, fit(new Vec2(x, y)));
    return placed;
  }, [spec, fit]);
  const endpoints = useMemo(() => new Map(spec.edges.map(([id, a, b]) => [id, [a, b] as const])), [spec]);

  const segment = (edgeId: string, z: number): [number, number, number][] | null => {
    const ends = endpoints.get(edgeId);
    if (!ends) return null;
    const [from, to] = [position.get(ends[0])!, position.get(ends[1])!];
    return [vec2ToTuple(from, offset), vec2ToTuple(to, offset)].map(([x, y]) => [x, y, z] as [number, number, number]);
  };

  const groupColor = new Map<string, string>();
  result.groups?.forEach((group, index) => {
    for (const id of group) groupColor.set(id, GRAPH_COLORS.groups[index % GRAPH_COLORS.groups.length]!);
  });
  const blocked = new Set(result.blocked ?? []);
  const markerFor = new Map((result.markers ?? []).map((marker) => [marker.nodeId, marker]));

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {spec.edges.map(([id]) => {
        const points = segment(id, 0);
        if (!points) return null;
        if (blocked.has(id)) {
          return (
            <Line
              key={id}
              points={points}
              color={GRAPH_COLORS.blocked}
              lineWidth={2}
              dashed
              dashSize={0.06}
              gapSize={0.05}
            />
          );
        }
        const color = groupColor.get(id);
        return <Line key={id} points={points} color={color ?? GRAPH_COLORS.edge} lineWidth={color ? 3 : 1.5} />;
      })}

      {(result.input ?? []).map((id) => {
        const points = segment(id, 0.01);
        return points && !blocked.has(id) ? (
          <Line key={`input-${id}`} points={points} color={GRAPH_COLORS.input} lineWidth={2.5} />
        ) : null;
      })}

      {result.highlight.map((id) => {
        const points = segment(id, 0.02);
        return points ? <Line key={`result-${id}`} points={points} color={GRAPH_COLORS.result} lineWidth={4} /> : null;
      })}

      {[...position].map(([id, point]) => {
        const marker = markerFor.get(id);
        const [x, y] = vec2ToTuple(point, offset);
        return (
          <mesh key={`node-${id}`} position={[x, y, 0.03]}>
            <circleGeometry args={[marker ? 0.09 : 0.05, 20]} />
            <meshBasicMaterial color={marker ? GRAPH_COLORS.markers[marker.kind] : GRAPH_COLORS.node} />
          </mesh>
        );
      })}

      {(result.markers ?? [])
        .filter((marker) => marker.label && position.has(marker.nodeId))
        .map((marker) => {
          const [x, y] = vec2ToTuple(position.get(marker.nodeId)!, offset);
          return (
            <Html key={`label-${marker.nodeId}`} center position={[x, y - 0.2, 0]} style={{ pointerEvents: 'none' }}>
              <div className='rounded bg-black/70 px-1 text-[7px] leading-tight text-white/85'>{marker.label}</div>
            </Html>
          );
        })}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-40 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{name}</div>
          <div className={result.found ? 'text-green-300/90' : 'text-red-300/90'}>{result.summary}</div>
        </div>
      </Html>
    </group>
  );
}
