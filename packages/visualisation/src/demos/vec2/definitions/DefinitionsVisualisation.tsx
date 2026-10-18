'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo, useState } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import type { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import { definitionGraph, type DefinitionGraph } from '../../../playground/graph';
import { evaluateDefinition } from '@dirty-geometry/vec2/recording/replay';
import { plateDefaults, recordPlate, type PlateParams } from '@dirty-geometry/vec2/examples/definitions/plate';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { GeometryRender } from '../../../geometry/components/GeometryRender';
import { DEFINITION_COLORS as C } from './colors';

type Cell = { name: 'Replayed result' | 'Definition graph' };
const rows: readonly (readonly Cell[])[] = [[{ name: 'Replayed result' }, { name: 'Definition graph' }]];

const sliders: { key: keyof PlateParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'width', label: 'width', min: 2, max: 12, step: 0.1 },
  { key: 'height', label: 'height', min: 2, max: 8, step: 0.1 },
  { key: 'holeRadius', label: 'holeRadius', min: 0.2, max: 1.8, step: 0.05 },
  { key: 'holeX', label: 'holeX', min: 0.2, max: 0.8, step: 0.01 },
];

/** Fixed framing for the largest plate, so changing a param visibly changes the drawing. */
const resultFit = fitPointsToFrame([new Vec2(0, 0), new Vec2(12, 8)]);

type Replay = { plate: Polygon2[]; mesh?: TriMesh2; hole: Polygon2; area: number; ms: number } | { error: string };

function ResultCell({ replay, offset }: { replay: Replay; offset: Vec2 }) {
  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />
      {'error' in replay ? null : (
        <>
          {replay.mesh?.triangles.map(([a, b, c], index) => (
            <Line
              key={`tri-${index}`}
              points={[a, b, c, a].map((i) => vec2ToTuple(resultFit(replay.mesh!.vertices[i]!), offset))}
              color={C.mesh}
              lineWidth={1}
            />
          ))}
          {replay.plate.map((polygon, index) => (
            <GeometryRender
              key={`plate-${index}`}
              geometry={polygon}
              fit={resultFit}
              offset={offset}
              color={C.plate}
              lineWidth={2.5}
            />
          ))}
          <GeometryRender
            geometry={replay.hole}
            fit={resultFit}
            offset={offset}
            color={C.hole}
            lineWidth={1.5}
            z={0.01}
          />
        </>
      )}
      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='w-max max-w-56 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>Replayed result</div>
          <div className={'error' in replay ? 'text-red-300/90' : 'text-green-300/90'}>
            {'error' in replay
              ? replay.error
              : `area ${replay.area.toFixed(2)} · ${replay.mesh?.triangles.length ?? 0} triangles · ${replay.ms.toFixed(1)} ms`}
          </div>
        </div>
      </Html>
    </group>
  );
}

type DisplayNode = { id: string; label: string; kind: string; outputs: string[]; depth: number; row: number };

/**
 * Display-only grouping: sibling nodes with the same operation at the same depth (the 16 hole vertices)
 * are drawn as one `op ×n` node. The definition itself keeps every node.
 */
function groupGraph(graph: DefinitionGraph): { nodes: DisplayNode[]; edges: [string, string, boolean][] } {
  const groupOf = new Map<string, string>();
  const groups = new Map<string, DisplayNode & { count: number }>();
  for (const node of graph.nodes) {
    const groupable = node.kind === 'operation' && node.outputs.length === 0;
    const key = groupable ? `${node.depth}|${node.op}` : node.id;
    groupOf.set(node.id, key);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    groups.set(key, {
      id: key,
      label: node.label,
      kind: node.kind,
      outputs: node.outputs,
      depth: node.depth,
      row: 0,
      count: 1,
    });
  }
  const rowsAtDepth = new Map<number, number>();
  const nodes = [...groups.values()].map(({ count, ...node }) => {
    const row = rowsAtDepth.get(node.depth) ?? 0;
    rowsAtDepth.set(node.depth, row + 1);
    const name = node.label.replace(/\(.*\)$/, '');
    return { ...node, row, label: count > 1 ? `${name} ×${count}` : node.label };
  });
  const seen = new Set<string>();
  const edges: [string, string, boolean][] = [];
  for (const edge of graph.edges) {
    const from = groupOf.get(edge.from)!;
    const to = groupOf.get(edge.to)!;
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) continue;
    seen.add(key);
    edges.push([from, to, edge.role === 'self']);
  }
  return { nodes, edges };
}

function GraphCell({ graph, offset, summary }: { graph: DefinitionGraph; offset: Vec2; summary: string }) {
  const display = useMemo(() => groupGraph(graph), [graph]);
  const placed = useMemo(() => {
    // Layers run top to bottom; nodes of a layer sit side by side with room for their labels.
    const raw = new Map(display.nodes.map((node) => [node.id, new Vec2(node.row * 3, -node.depth)]));
    const widest = Math.max(0, ...display.nodes.map((node) => node.row)) * 3 + 3;
    const fit = fitPointsToFrame([...raw.values(), new Vec2(widest, 0)], 0.2);
    return new Map([...raw].map(([id, point]) => [id, fit(point)]));
  }, [display]);
  const colorOf = (kind: string, outputs: readonly string[]) =>
    outputs.length > 0 ? C.output : kind === 'param' ? C.param : kind === 'operation' ? C.operation : C.structural;

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />
      {display.edges.map(([from, to, self], index) => (
        <Line
          key={`edge-${index}`}
          points={[vec2ToTuple(placed.get(from)!, offset), vec2ToTuple(placed.get(to)!, offset)]}
          color={C.edge}
          lineWidth={self ? 1.5 : 1}
          dashed={!self}
          dashSize={0.04}
          gapSize={0.03}
        />
      ))}
      {display.nodes.map((node) => {
        const [x, y] = vec2ToTuple(placed.get(node.id)!, offset);
        return (
          <group key={node.id}>
            <mesh position={[x, y, 0.02]}>
              <circleGeometry args={[0.04, 16]} />
              <meshBasicMaterial color={colorOf(node.kind, node.outputs)} />
            </mesh>
            <Html position={[x + 0.05, y, 0]} style={{ pointerEvents: 'none' }}>
              <div className='-translate-y-1/2 text-[7px] leading-none whitespace-nowrap text-white/75'>
                {node.label}
                {node.outputs.length > 0 && <span className='text-purple-300'> → {node.outputs.join(', ')}</span>}
              </div>
            </Html>
          </group>
        );
      })}
      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='w-max max-w-56 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>Definition graph</div>
          <div className='text-white/70'>{summary}</div>
        </div>
      </Html>
    </group>
  );
}

export function DefinitionsVisualisation() {
  const definition = useMemo(() => recordPlate(), []);
  const graph = useMemo(() => definitionGraph(definition), [definition]);
  const json = useMemo(() => JSON.stringify(definition), [definition]);
  const [params, setParams] = useState<PlateParams>(plateDefaults);

  const replay = useMemo((): Replay => {
    try {
      const start = performance.now();
      const { outputs } = evaluateDefinition(definition, { params });
      return {
        plate: outputs.plate as Polygon2[],
        mesh: outputs.mesh as TriMesh2 | undefined,
        hole: outputs.hole as Polygon2,
        area: outputs.area as number,
        ms: performance.now() - start,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message.split('\n')[0]! : String(error) };
    }
  }, [definition, params]);

  const summary = `${definition.nodes.length} nodes · ${graph.depth} layers · ${(json.length / 1024).toFixed(1)} kB JSON`;

  return (
    <div className='relative h-full w-full'>
      <ScenarioGridVisualisation
        scenarioRows={rows}
        columns={2}
        renderCell={(cell, offset) =>
          cell.name === 'Replayed result' ? (
            <ResultCell replay={replay} offset={offset} />
          ) : (
            <GraphCell graph={graph} offset={offset} summary={summary} />
          )
        }
      />
      <form
        className='absolute top-4 left-4 z-10 w-56 space-y-2 rounded-md bg-black/75 p-3 text-xs text-white shadow-lg backdrop-blur-sm'
        aria-label='Definition params'
        onSubmit={(event) => event.preventDefault()}
      >
        <div className='text-[10px] font-semibold tracking-wide text-white/50 uppercase'>Params (replayed)</div>
        {sliders.map(({ key, label, min, max, step }) => (
          <label key={key} className='block'>
            <span className='flex justify-between text-white/80'>
              <span className='font-mono'>{label}</span>
              <span className='font-mono'>{params[key].toFixed(2)}</span>
            </span>
            <input
              type='range'
              name={key}
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(event) => setParams((current) => ({ ...current, [key]: Number(event.target.value) }))}
              className='w-full'
            />
          </label>
        ))}
      </form>
    </div>
  );
}

export default DefinitionsVisualisation;
