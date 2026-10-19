'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { isGeometry2, type Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
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

type Drawn = { name: string; geometry: Geometry2; role: 'intermediate' | 'output' | 'selected'; color: string };

/** Geometries of a node value: the value itself, or the geometries in its items or (plain object) fields. */
const geometriesOf = (value: unknown): Geometry2[] =>
  isGeometry2(value)
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(geometriesOf)
      : value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
        ? Object.values(value).flatMap(geometriesOf)
        : [];

const rows = [[{ name: 'Result' }]] as const;

/** The value of an input or a cell. */
export const valueOf = (evaluation: Evaluation, name: string): unknown => {
  const cell = evaluation.cells.get(name);
  return cell ? ('value' in cell ? cell.value : undefined) : evaluation.inputs.get(name);
};

/** Every input's and cell's geometry: intermediates faint, outputs bold, the selected one highlighted. */
export function PlaygroundCanvas({
  definition,
  evaluation,
  selected,
}: {
  definition: Definition;
  evaluation: Evaluation;
  selected: string | null;
}) {
  const drawn = useMemo((): Drawn[] => {
    const outputs = definition.cells.filter((cell) => cell.output).map((cell) => cell.name);
    const items: Drawn[] = [];
    for (const { name } of [...definition.inputs, ...definition.cells]) {
      const output = outputs.indexOf(name);
      const role = name === selected ? 'selected' : output >= 0 ? 'output' : 'intermediate';
      const color =
        role === 'selected'
          ? PLAYGROUND_COLORS.selected
          : role === 'output'
            ? PLAYGROUND_COLORS.outputs[output % PLAYGROUND_COLORS.outputs.length]!
            : PLAYGROUND_COLORS.intermediate;
      for (const geometry of geometriesOf(valueOf(evaluation, name))) items.push({ name, geometry, role, color });
    }
    // Draw intermediates first so outputs and the selection sit on top.
    const order = { intermediate: 0, output: 1, selected: 2 } as const;
    return items.sort((a, b) => order[a.role] - order[b.role]);
  }, [definition, evaluation, selected]);

  const fit = useMemo(() => {
    const anchors = frameAnchorPoints(drawn.map((item) => item.geometry));
    return fitPointsToFrame(anchors.length > 0 ? anchors : []);
  }, [drawn]);

  const selectedValue = selected ? valueOf(evaluation, selected) : undefined;

  return (
    <ScenarioGridVisualisation
      scenarioRows={rows}
      columns={1}
      renderCell={(_, offset: Vec2) => (
        <group>
          <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />
          {drawn.map((item, index) => (
            <GeometryRender
              key={`${item.name}-${index}`}
              keyPrefix={`${item.name}-${index}`}
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
