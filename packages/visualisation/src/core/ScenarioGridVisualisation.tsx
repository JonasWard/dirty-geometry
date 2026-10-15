'use client';

import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  buildScenarioGridLayout,
  type NamedScenario,
  type ScenarioGridCell,
  type ScenarioGridOptions,
} from './scenarioGrid';
import { VisualisationCanvasHost } from './VisualisationShell';

type ScenarioGridVisualisationProps<T extends NamedScenario> = {
  scenarioRows: readonly (readonly T[])[];
  renderCell: (scenario: T, offset: Vec2) => ReactNode;
  onPointerMissed?: () => void;
  maxZoom?: number;
} & ScenarioGridOptions;

function ScenarioGridScene<T extends NamedScenario>({
  cells,
  cameraCenterX,
  cameraCenterY,
  renderCell,
  maxZoom,
}: {
  cells: readonly ScenarioGridCell<T>[];
  cameraCenterX: number;
  cameraCenterY: number;
  renderCell: (scenario: T, offset: Vec2) => ReactNode;
  maxZoom: number;
}) {
  return (
    <>
      <color attach='background' args={['#0b0d12']} />
      <ambientLight intensity={0.8} />
      <OrbitControls
        makeDefault
        enableRotate={false}
        target={[cameraCenterX, cameraCenterY, 0]}
        minZoom={20}
        maxZoom={maxZoom}
        zoomSpeed={0.8}
      />

      {cells.map(({ key, scenario, offset }) => (
        <group key={key}>{renderCell(scenario, offset)}</group>
      ))}
    </>
  );
}

/** Shared orthographic canvas for a multi-row scenario grid. */
export function ScenarioGridVisualisation<T extends NamedScenario>({
  scenarioRows,
  renderCell,
  columns,
  padding,
  zoomScale = 0.85,
  cellScale = 1,
  onPointerMissed,
  maxZoom = 200,
}: ScenarioGridVisualisationProps<T>) {
  const layout = useMemo(
    () => buildScenarioGridLayout(scenarioRows, { columns, padding, zoomScale, cellScale }),
    [scenarioRows, columns, padding, zoomScale, cellScale],
  );

  return (
    <VisualisationCanvasHost>
      {(size) => {
        const zoom = Math.min(size.width / layout.gridWidth, size.height / layout.gridHeight) * zoomScale;

        return (
          <Canvas style={{ width: '100%', height: '100%' }} onPointerMissed={onPointerMissed} gl={{ antialias: true }}>
            <OrthographicCamera
              makeDefault
              position={[layout.cameraCenterX, layout.cameraCenterY, 100]}
              zoom={zoom}
              near={0.1}
              far={1000}
            />
            <ScenarioGridScene
              cells={layout.cells}
              cameraCenterX={layout.cameraCenterX}
              cameraCenterY={layout.cameraCenterY}
              renderCell={renderCell}
              maxZoom={maxZoom}
            />
          </Canvas>
        );
      }}
    </VisualisationCanvasHost>
  );
}
