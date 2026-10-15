import type { Grid2 } from '@dirty-geometry/vec2/grid/core/grid2';
import type { GeometryDisplayContext } from '../context';
import { createGridLatticeDisplay, type GridLatticeDisplay } from './shared';

export function createGrid2Display(
  grid: Grid2,
  columnCount: number,
  rowCount: number,
  ctx: GeometryDisplayContext,
): GridLatticeDisplay {
  return createGridLatticeDisplay(grid, columnCount, rowCount, ctx);
}
