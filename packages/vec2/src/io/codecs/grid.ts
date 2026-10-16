import { Epsilon } from '../../core/epsilon';
import { Frame2 } from '../../core/frame2';
import { Axis } from '../../grid/core/grid-axis';
import { GridCell2 } from '../../grid/core/grid-cell2';
import { Grid2 } from '../../grid/core/grid2';
import { GridCell2Collection } from '../../grid/regions/grid-cell2-collection';
import { GridLine2 } from '../../grid/regions/grid-line2';
import { GridPolygon2 } from '../../grid/regions/grid-polygon2';
import { GridPolyline2 } from '../../grid/regions/grid-polyline2';
import { GridRectangle2 } from '../../grid/regions/grid-rectangle2';
import { codec } from '../codec';
import {
  isAxisJson,
  isCellCollectionJson,
  isGrid2Json,
  isGridCell2Json,
  isGridLine2Json,
  isGridPolygon2Json,
  isGridPolyline2Json,
  isGridRectangle2Json,
} from '../json-guards';
import { interval2Codec } from './bounds';
import { epsilonCodec, frame2Codec } from './core';

export const gridCell2Codec = codec(GridCell2.type, isGridCell2Json, (json) => new GridCell2(json.i, json.j));
const cell = (json: unknown) => gridCell2Codec.decode(json);

export const axisCodec = codec(Axis.type, isAxisJson, (json) => {
  const domain = json.domain ? interval2Codec.decode(json.domain) : null;
  switch (json.kind) {
    case 'unit':
      return Axis.unit(domain);
    case 'uniform':
      return Axis.uniform(json.size, domain);
    case 'custom':
      return Axis.custom(json.defaultSize, json.sizes as Record<number, number>, domain);
  }
});

export const grid2Codec = codec(
  Grid2.type,
  isGrid2Json,
  (json) =>
    new Grid2({
      u: axisCodec.decode(json.u),
      v: axisCodec.decode(json.v),
      frame: json.frame ? frame2Codec.decode(json.frame) : Frame2.worldXY(),
      epsilon: json.epsilon ? epsilonCodec.decode(json.epsilon) : Epsilon.preferIn,
    }),
);

export const gridLine2Codec = codec(GridLine2.type, isGridLine2Json, (json) => new GridLine2(cell(json.from), cell(json.to)));

export const gridPolyline2Codec = codec(
  GridPolyline2.type,
  isGridPolyline2Json,
  (json) => new GridPolyline2(json.vertices.map(cell)),
);

export const gridPolygon2Codec = codec(
  GridPolygon2.type,
  isGridPolygon2Json,
  (json) => new GridPolygon2(json.vertices.map(cell)),
);

export const gridRectangle2Codec = codec(
  GridRectangle2.type,
  isGridRectangle2Json,
  (json) => new GridRectangle2(cell(json.bottomLeft), cell(json.topRight)),
);

export const gridCell2CollectionCodec = codec(
  GridCell2Collection.type,
  isCellCollectionJson,
  (json) => new GridCell2Collection(json.cells.map(cell)),
);

export const gridCodecs = [
  gridCell2Codec,
  axisCodec,
  grid2Codec,
  gridLine2Codec,
  gridPolyline2Codec,
  gridPolygon2Codec,
  gridRectangle2Codec,
  gridCell2CollectionCodec,
] as const;
