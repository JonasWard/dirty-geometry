import type { GridPolyline2 } from '@dirty-geometry/vec2/grid/regions/grid-polyline2';
import type { GridDisplayContext } from './shared';
import { createCellCollectionFillDisplay, createGridCellMarkerDisplay, fittedCellCenter } from './shared';
import type { Point3 } from '../types';

export type GridPolyline2Display = {
  vertexMarkers: ReturnType<typeof createGridCellMarkerDisplay>;
  cellFill: ReturnType<typeof createCellCollectionFillDisplay>;
  outlineSegments: [Point3, Point3][];
};

export function createGridPolyline2Display(geometry: GridPolyline2, ctx: GridDisplayContext): GridPolyline2Display {
  const collection = geometry.toCellCollection();
  const outlineSegments: [Point3, Point3][] = [];

  for (let i = 0; i < geometry.vertices.length - 1; i++) {
    const from = fittedCellCenter(ctx.grid, geometry.vertices[i]!, ctx.fit, ctx.offset);
    const to = fittedCellCenter(ctx.grid, geometry.vertices[i + 1]!, ctx.fit, ctx.offset);
    outlineSegments.push([from, to]);
  }

  return {
    vertexMarkers: createGridCellMarkerDisplay(ctx.grid, [...geometry.vertices], ctx),
    cellFill: createCellCollectionFillDisplay(ctx.grid, collection, ctx),
    outlineSegments,
  };
}
