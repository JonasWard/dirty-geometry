import type { GridRectangle2 } from '@dirty-geometry/vec2/grid/regions/grid-rectangle2';
import type { GridDisplayContext } from './shared';
import { createCellCollectionFillDisplay, createGridCellMarkerDisplay, fittedCellCenter } from './shared';
import type { Point3 } from '../types';

export type GridRectangle2Display = {
  cornerMarkers: ReturnType<typeof createGridCellMarkerDisplay>;
  cellFill: ReturnType<typeof createCellCollectionFillDisplay>;
  outlineSegments: [Point3, Point3][];
};

export function createGridRectangle2Display(geometry: GridRectangle2, ctx: GridDisplayContext): GridRectangle2Display {
  const collection = geometry.toCellCollection();
  const corners = geometry.corners();

  const outlineSegments: [Point3, Point3][] = [];
  for (let i = 0; i < corners.length; i++) {
    const from = fittedCellCenter(ctx.grid, corners[i]!, ctx.fit, ctx.offset);
    const to = fittedCellCenter(ctx.grid, corners[(i + 1) % corners.length]!, ctx.fit, ctx.offset);
    outlineSegments.push([from, to]);
  }

  return {
    cornerMarkers: createGridCellMarkerDisplay(ctx.grid, [geometry.bottomLeft, geometry.topRight], ctx),
    cellFill: createCellCollectionFillDisplay(ctx.grid, collection, ctx),
    outlineSegments,
  };
}
