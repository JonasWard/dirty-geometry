import type { GridLine2 } from '@dirty-geometry/vec2/grid/regions/grid-line2';
import type { GridDisplayContext } from './shared';
import { createCellCollectionFillDisplay, createGridCellMarkerDisplay } from './shared';

export type GridLine2Display = {
  endpointMarkers: ReturnType<typeof createGridCellMarkerDisplay>;
  cellFill: ReturnType<typeof createCellCollectionFillDisplay>;
};

export function createGridLine2Display(geometry: GridLine2, ctx: GridDisplayContext): GridLine2Display {
  const collection = geometry.toCellCollection();

  return {
    endpointMarkers: createGridCellMarkerDisplay(ctx.grid, [geometry.from, geometry.to], ctx),
    cellFill: createCellCollectionFillDisplay(ctx.grid, collection, ctx),
  };
}
