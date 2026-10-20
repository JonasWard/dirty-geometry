'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { fitPointsToFrame, frameCorners, labelPosition } from '../core/frame';
import { ScenarioGridVisualisation } from '../core/ScenarioGridVisualisation';
import { GeometryRender } from '../geometry/components/GeometryRender';
import { frameAnchorPoints } from '../geometry/frame/geometryFrame';
import { describeValue } from './describe';
import { drawnItems, valueOf, type DrawOptions } from './draw';

export { outputColor, PLAYGROUND_COLORS } from './draw';

const rows = [[{ name: 'Result' }]] as const;

/** Every input's and cell's geometry: intermediates faint, outputs bold, the selected one highlighted. */
export function PlaygroundCanvas({
  definition,
  evaluation,
  selected,
  hidden,
  intermediates,
  onHover,
}: {
  definition: Definition;
  evaluation: Evaluation;
  selected: string | null;
  /** Called with the name under the pointer (`null` when it leaves). */
  onHover?: (name: string | null) => void;
} & Omit<DrawOptions, 'selected'>) {
  const { drawn, framed } = useMemo(
    () => drawnItems(definition, evaluation, { selected, hidden, intermediates }),
    [definition, evaluation, selected, hidden, intermediates],
  );

  const fit = useMemo(() => {
    const anchors = frameAnchorPoints(framed);
    return fitPointsToFrame(anchors.length > 0 ? anchors : []);
  }, [framed]);

  const selectedValue = selected ? valueOf(evaluation, selected) : undefined;

  return (
    <ScenarioGridVisualisation
      scenarioRows={rows}
      columns={1}
      renderCell={(_, offset: Vec2) => (
        <group>
          <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />
          {drawn.map((item) => (
            <group
              key={item.key}
              onPointerOver={
                onHover &&
                ((event) => {
                  event.stopPropagation();
                  onHover(item.name);
                })
              }
              onPointerOut={onHover && (() => onHover(null))}
            >
              <GeometryRender
                keyPrefix={item.key}
                geometry={item.geometry}
                fit={fit}
                offset={offset}
                color={item.color}
                lineWidth={item.role === 'intermediate' ? 1 : item.role === 'output' ? 2.5 : 3.5}
                pointRadius={item.role === 'intermediate' ? 0.035 : 0.06}
                z={item.role === 'intermediate' ? 0 : item.role === 'output' ? 0.01 : 0.02}
              />
            </group>
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
