'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  detectRectilinearGridFromPolygons,
  DOUGLAS_PEUCKER_GRID_DEFAULTS,
} from '@dirty-geometry/vec2/operations/polygon-analysis/rectilinear-detection';
import type { RectilinearGridDetection } from '@dirty-geometry/vec2/operations/polygon-analysis/rectilinear-detection';
import { rectangleDetectionExamples } from '@dirty-geometry/vec2/examples/grid/rectangle-detection-examples';
import type { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { GRID2_COLORS, earthToneAt } from './colors';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../core/frame';
import { GridGeometryRender } from '../../geometry/components/GridGeometryRender';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';
import { gridWorldLines } from '../../geometry/display/grid/shared';

export const grid2RectangleDetectionMeta: VisualisationMeta = {
  id: 'grid2/rectangle-detection',
  label: 'Grid2 Rect Detect',
  title: 'Grid2 rectangle detection',
  description:
    'Build a custom Grid2 from one or more world-space rectilinear Polygon2s (optionally Douglas-Peucker simplified), trace axis-aligned grid boundaries, and decompose occupied cells into rectangles.',
  legend: [
    { color: '#d0d0d0', label: 'World polygon', shape: 'line' },
    { color: GRID2_COLORS.lattice, label: 'Grid lattice', shape: 'line' },
    { color: GRID2_COLORS.geometryOutline, label: 'Grid polygon', shape: 'line' },
    { color: GRID2_COLORS.resultFill, label: 'Detected rectangles' },
  ],
};

export type RectangleDetectionScenario = {
  name: string;
  polygons: Polygon2[];
  detection: RectilinearGridDetection;
};

export const rectangleDetectionScenarios: RectangleDetectionScenario[] = rectangleDetectionExamples.map((example) => ({
  name: example.name,
  polygons: [...example.polygons],
  detection: detectRectilinearGridFromPolygons([...example.polygons], Epsilon.preferIn, {
    simplify: DOUGLAS_PEUCKER_GRID_DEFAULTS,
  }),
}));

function scenarioAnchorPoints(scenario: RectangleDetectionScenario): Vec2[] {
  const points: Vec2[] = scenario.polygons.flatMap((polygon) => polygon.vertices.map((vertex) => vertex.clone()));
  const { detection } = scenario;

  for (const { from, to } of gridWorldLines(
    detection.grid,
    detection.extent.columnCount(),
    detection.extent.rowCount(),
  )) {
    points.push(from, to);
  }

  for (const rectangle of detection.rectangles) {
    for (const cell of rectangle.toCellCollection().toArray()) {
      const world = detection.grid.cellWorldRect(cell);
      points.push(world.min(), world.max());
    }
  }

  return points;
}

function WorldPolygonOutline({
  polygons,
  fit,
  offset,
}: {
  polygons: readonly Polygon2[];
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
}) {
  return (
    <>
      {polygons.flatMap((polygon, polygonIndex) =>
        polygon
          .segments()
          .map((segment, index) => (
            <Line
              key={`world-polygon-${polygonIndex}-${index}`}
              points={[vec2ToTuple(fit(segment.from), offset), vec2ToTuple(fit(segment.to), offset)]}
              color='#d0d0d0'
              lineWidth={2}
            />
          )),
      )}
    </>
  );
}

function RectangleDetectionVisual({ scenario, offset }: { scenario: RectangleDetectionScenario; offset: Vec2 }) {
  const fit = useMemo(() => fitPointsToFrame(scenarioAnchorPoints(scenario)), [scenario]);
  const { detection } = scenario;

  return (
    <group>
      <Line points={frameCorners(offset)} color={GRID2_COLORS.frame} lineWidth={1} />

      <WorldPolygonOutline polygons={detection.sourcePolygons} fit={fit} offset={offset} />

      <GridGeometryRender
        grid={detection.grid}
        fit={fit}
        offset={offset}
        columnCount={detection.extent.columnCount()}
        rowCount={detection.extent.rowCount()}
        latticeColor={GRID2_COLORS.lattice}
        keyPrefix={`${scenario.name}-lattice`}
      />

      {detection.gridPolygons.map((gridPolygon, index) => (
        <GridGeometryRender
          key={`${scenario.name}-grid-polygon-${index}`}
          grid={detection.grid}
          geometry={gridPolygon}
          fit={fit}
          offset={offset}
          columnCount={detection.extent.columnCount()}
          rowCount={detection.extent.rowCount()}
          showLattice={false}
          fillColor={GRID2_COLORS.geometryFill}
          outlineColor={GRID2_COLORS.geometryOutline}
          fillOpacity={0.12}
          keyPrefix={`${scenario.name}-grid-polygon-${index}`}
        />
      ))}

      {detection.rectangles.map((rectangle, index) => (
        <GridGeometryRender
          key={`${scenario.name}-rect-${index}`}
          grid={detection.grid}
          geometry={rectangle}
          fit={fit}
          offset={offset}
          columnCount={detection.extent.columnCount()}
          rowCount={detection.extent.rowCount()}
          showLattice={false}
          fillColor={earthToneAt(index)}
          outlineColor={earthToneAt(index)}
          fillOpacity={0.35}
          keyPrefix={`${scenario.name}-rect-${index}`}
        />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-44 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {detection.extent.columnCount()}×{detection.extent.rowCount()} grid
          </div>
          <div className='text-white/50'>
            {detection.sourcePolygons.length} polygons · {detection.rectangles.length} rectangles
          </div>
        </div>
      </Html>
    </group>
  );
}

export function Grid2RectangleDetectionVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={[rectangleDetectionScenarios]}
      renderCell={(scenario, offset) => <RectangleDetectionVisual scenario={scenario} offset={offset} />}
    />
  );
}
