'use client';

import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import type { ReactNode } from 'react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  buildScenarioGridLayout,
  fitZoom,
  minZoomFor,
  type NamedScenario,
  type ScenarioGridCell,
  type ScenarioGridLayout,
  type ScenarioGridOptions,
} from './scenarioGrid';

type ScenarioGridVisualisationProps<T extends NamedScenario> = {
  scenarioRows: readonly (readonly T[])[];
  renderCell: (scenario: T, offset: Vec2) => ReactNode;
  onPointerMissed?: () => void;
  maxZoom?: number;
} & ScenarioGridOptions;

/**
 * Orthographic camera + pan/zoom controls. The zoom is fitted to the canvas when the layout changes,
 * not on every resize, so the user's zoom survives resizing; the zoom floor stays below the fit.
 */
function GridCamera({
  layout,
  zoomScale,
  maxZoom,
}: {
  layout: ScenarioGridLayout;
  zoomScale: number;
  maxZoom: number;
}) {
  const size = useThree((state) => state.size);
  const cameraRef = useRef<ThreeOrthographicCamera>(null);
  const fittedFor = useRef<string | null>(null);
  const [fittedZoom, setFittedZoom] = useState(() => fitZoom(size, layout, zoomScale));
  // Demos often rebuild their scenario rows inline; refit only when the grid's extent actually changes.
  const extent = `${layout.gridWidth}|${layout.gridHeight}|${layout.cameraCenterX}|${layout.cameraCenterY}|${zoomScale}`;

  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera || size.width <= 1 || size.height <= 1 || fittedFor.current === extent) return;
    fittedFor.current = extent;
    const zoom = fitZoom(size, layout, zoomScale);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    setFittedZoom(zoom);
  }, [extent, layout, size, zoomScale]);

  return (
    <>
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        position={[layout.cameraCenterX, layout.cameraCenterY, 100]}
        near={0.1}
        far={1000}
      />
      <OrbitControls
        makeDefault
        enableRotate={false}
        target={[layout.cameraCenterX, layout.cameraCenterY, 0]}
        minZoom={minZoomFor(fittedZoom)}
        maxZoom={Math.max(maxZoom, fittedZoom)}
        zoomSpeed={0.8}
      />
    </>
  );
}

function ScenarioGridSceneInner<T extends NamedScenario>({
  cells,
  renderCell,
}: {
  cells: readonly ScenarioGridCell<T>[];
  renderCell: (scenario: T, offset: Vec2) => ReactNode;
}) {
  return (
    <>
      <color attach='background' args={['#0b0d12']} />
      <ambientLight intensity={0.8} />
      {cells.map(({ key, scenario, offset }) => (
        <group key={key}>{renderCell(scenario, offset)}</group>
      ))}
    </>
  );
}

/** The cells only re-render when the layout or the cell renderer change (not on resize or camera moves). */
const ScenarioGridScene = memo(ScenarioGridSceneInner) as typeof ScenarioGridSceneInner;

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
    <div className='h-full w-full'>
      <Canvas style={{ width: '100%', height: '100%' }} onPointerMissed={onPointerMissed} gl={{ antialias: true }}>
        <GridCamera layout={layout} zoomScale={zoomScale} maxZoom={maxZoom} />
        <ScenarioGridScene cells={layout.cells} renderCell={renderCell} />
      </Canvas>
    </div>
  );
}
