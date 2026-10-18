'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { isGeometry2, type Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import type { DefinitionV3 as Definition } from '@dirty-geometry/vec2/recording/v3';
import { fitPointsToFrame, frameCorners, labelPosition } from '../core/frame';
import { ScenarioGridVisualisation } from '../core/ScenarioGridVisualisation';
import { GeometryRender } from '../geometry/components/GeometryRender';
import { frameAnchorPoints } from '../geometry/frame/geometryFrame';
import { describeValue } from './describe';

export const PLAYGROUND_COLORS = {
  intermediate: '#5b6577',
  outputs: ['#4da3ff', '#7dff7d', '#ffb347', '#c77dff', '#5ce1ff', '#ff7db8'],
  selected: '#ffd84d',
} as const;

type Drawn = { node: string; geometry: Geometry2; role: 'intermediate' | 'output' | 'selected'; color: string };

/** Geometries of a node value: the value itself, or the geometries in an array value. */
const geometriesOf = (value: unknown): Geometry2[] =>
  isGeometry2(value) ? [value] : Array.isArray(value) ? value.filter(isGeometry2) : [];

const rows = [[{ name: 'Result' }]] as const;

/** Every node's geometry: intermediates faint, outputs bold, the selected node highlighted. */
export function PlaygroundCanvas({
  definition,
  values,
  selected,
}: {
  definition: Definition;
  values: ReadonlyMap<string, unknown>;
  selected: string | null;
}) {
  const drawn = useMemo((): Drawn[] => {
    const outputIndex = new Map(Object.values(definition.outputs).map((node, index) => [node, index]));
    const items: Drawn[] = [];
    for (const node of definition.nodes) {
      const output = outputIndex.get(node.id);
      const role = node.id === selected ? 'selected' : output !== undefined ? 'output' : 'intermediate';
      const color =
        role === 'selected'
          ? PLAYGROUND_COLORS.selected
          : role === 'output'
            ? PLAYGROUND_COLORS.outputs[output! % PLAYGROUND_COLORS.outputs.length]!
            : PLAYGROUND_COLORS.intermediate;
      for (const geometry of geometriesOf(values.get(node.id))) items.push({ node: node.id, geometry, role, color });
    }
    // Draw intermediates first so outputs and the selection sit on top.
    const order = { intermediate: 0, output: 1, selected: 2 } as const;
    return items.sort((a, b) => order[a.role] - order[b.role]);
  }, [definition, values, selected]);

  const fit = useMemo(() => {
    const anchors = frameAnchorPoints(drawn.map((item) => item.geometry));
    return fitPointsToFrame(anchors.length > 0 ? anchors : []);
  }, [drawn]);

  const selectedValue = selected ? values.get(selected) : undefined;

  return (
    <ScenarioGridVisualisation
      scenarioRows={rows}
      columns={1}
      renderCell={(_, offset: Vec2) => (
        <group>
          <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />
          {drawn.map((item, index) => (
            <GeometryRender
              key={`${item.node}-${index}`}
              keyPrefix={`${item.node}-${index}`}
              geometry={item.geometry}
              fit={fit}
              offset={offset}
              color={item.color}
              lineWidth={item.role === 'intermediate' ? 1 : item.role === 'output' ? 2.5 : 3.5}
              pointRadius={item.role === 'intermediate' ? 0.035 : 0.06}
              z={item.role === 'intermediate' ? 0 : item.role === 'output' ? 0.01 : 0.02}
            />
          ))}
          <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
            <div className='w-max max-w-72 rounded bg-black/75 px-1.5 py-0.5 text-center text-[9px] leading-tight text-white'>
              {selected ? `${selected} = ${describeValue(selectedValue)}` : `${drawn.length} geometries`}
            </div>
          </Html>
        </group>
      )}
    />
  );
}
