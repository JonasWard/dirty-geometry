import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { GridLine2 } from '../../src/grid/regions/grid-line2';
import { GridPolygon2 } from '../../src/grid/regions/grid-polygon2';

/** Bresenham line fixtures used in tests and the Grid2 demo. */
export const gridLineExamples = {
  shallowSlope: new GridLine2(new GridCell2(0, 0), new GridCell2(6, 2)),
  steepSlope: new GridLine2(new GridCell2(0, 0), new GridCell2(2, 6)),
  gentleRise: new GridLine2(new GridCell2(1, 1), new GridCell2(7, 4)),
  backwardShallow: new GridLine2(new GridCell2(7, 4), new GridCell2(1, 1)),
  degeneratePoint: new GridLine2(new GridCell2(3, 2), new GridCell2(3, 2)),
} as const;

/** Concave polygon fixtures used in tests and the Grid2 demo. */
export const gridPolygonExamples = {
  lShape: new GridPolygon2([
    new GridCell2(0, 0),
    new GridCell2(2, 0),
    new GridCell2(2, 1),
    new GridCell2(1, 1),
    new GridCell2(1, 2),
    new GridCell2(0, 2),
  ]),
  concaveNotch: new GridPolygon2([
    new GridCell2(0, 0),
    new GridCell2(4, 0),
    new GridCell2(4, 2),
    new GridCell2(2, 2),
    new GridCell2(2, 4),
    new GridCell2(0, 4),
  ]),
  uShape: new GridPolygon2([
    new GridCell2(0, 0),
    new GridCell2(4, 0),
    new GridCell2(4, 4),
    new GridCell2(3, 4),
    new GridCell2(3, 1),
    new GridCell2(1, 1),
    new GridCell2(1, 4),
    new GridCell2(0, 4),
  ]),
  hPlate: new GridPolygon2([
    new GridCell2(0, 1),
    new GridCell2(0, 4),
    new GridCell2(1, 4),
    new GridCell2(1, 3),
    new GridCell2(3, 3),
    new GridCell2(3, 4),
    new GridCell2(4, 4),
    new GridCell2(4, 1),
    new GridCell2(3, 1),
    new GridCell2(3, 0),
    new GridCell2(1, 0),
    new GridCell2(1, 1),
  ]),
  arrowhead: new GridPolygon2([
    new GridCell2(2, 0),
    new GridCell2(4, 2),
    new GridCell2(3, 2),
    new GridCell2(3, 4),
    new GridCell2(1, 4),
    new GridCell2(1, 2),
    new GridCell2(0, 2),
  ]),
} as const;
