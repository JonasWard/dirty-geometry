import type { Aabb2, Aabb2Json } from '../bounds/aabb2';
import type { Interval2, Interval2Json } from '../bounds/interval2';
import type { Angle, AngleJson } from '../core/angle';
import type { Mat3, Mat3Json } from '../core/mat3';
import type { Vec2, Vec2Json } from '../core/vec2';
import type { Polyline2, Polyline2Json } from '../geometry/curves/polyline2';
import type { InfiniteLine2, InfiniteLine2Json } from '../geometry/primitives/infinite-line2';
import type { Hesse2, Hesse2Json } from '../geometry/primitives/hesse2';
import type { Line2, Line2Json } from '../geometry/primitives/line2';
import type { Ray2, Ray2Json } from '../geometry/primitives/ray2';
import type { Circle2, Circle2Json } from '../geometry/regions/circle2';
import type { Polygon2, Polygon2Json } from '../geometry/regions/polygon2';
import type { TriMesh2, TriMesh2Json } from '../geometry/regions/tri-mesh2';
import type { Frame2, Frame2Json } from '../core/frame2';
import type { GridCell2, GridCell2Json } from '../grid/core/grid-cell2';
import type { Axis, AxisJson } from '../grid/core/grid-axis';
import type { Grid2, Grid2Json } from '../grid/core/grid2';
import type { GridLine2, GridLine2Json } from '../grid/regions/grid-line2';
import type { GridPolyline2, GridPolyline2Json } from '../grid/regions/grid-polyline2';
import type { GridPolygon2, GridPolygon2Json } from '../grid/regions/grid-polygon2';
import type { GridRectangle2, GridRectangle2Json } from '../grid/regions/grid-rectangle2';
import type { GridCell2Collection, CellCollectionJson } from '../grid/regions/grid-cell2-collection';
import type { Epsilon, EpsilonJson } from '../core/epsilon';

import { aabb2Codec, interval2Codec } from './codecs/bounds';
import { angleCodec, epsilonCodec, frame2Codec, mat3Codec, vec2Codec } from './codecs/core';
import {
  circle2Codec,
  hesse2Codec,
  infiniteLine2Codec,
  line2Codec,
  polygon2Codec,
  polyline2Codec,
  ray2Codec,
  triMesh2Codec,
} from './codecs/geometry';
import {
  axisCodec,
  grid2Codec,
  gridCell2Codec,
  gridCell2CollectionCodec,
  gridLine2Codec,
  gridPolygon2Codec,
  gridPolyline2Codec,
  gridRectangle2Codec,
} from './codecs/grid';
import { defaultRegistry } from './default-registry';

export { CodecRegistry, codec, type Codec } from './codec';
export { createDefaultRegistry, defaultRegistry } from './default-registry';

export type MathJson =
  | Vec2Json
  | Mat3Json
  | AngleJson
  | Line2Json
  | Ray2Json
  | InfiniteLine2Json
  | Hesse2Json
  | Polyline2Json
  | Polygon2Json
  | Interval2Json
  | Aabb2Json
  | TriMesh2Json
  | Circle2Json
  | GridCell2Json
  | Frame2Json
  | Grid2Json
  | GridLine2Json
  | GridPolyline2Json
  | GridPolygon2Json
  | GridRectangle2Json
  | CellCollectionJson
  | EpsilonJson;

export type MathValue =
  | Vec2
  | Mat3
  | Angle
  | Line2
  | Ray2
  | InfiniteLine2
  | Hesse2
  | Polyline2
  | Polygon2
  | Interval2
  | Aabb2
  | TriMesh2
  | Circle2
  | GridCell2
  | Frame2
  | Grid2
  | GridLine2
  | GridPolyline2
  | GridPolygon2
  | GridRectangle2
  | GridCell2Collection
  | Epsilon;

/**
 * Decode JSON written by `toJson` back into vec2 values. A thin facade over {@link defaultRegistry};
 * use a {@link CodecRegistry} directly to add your own types.
 */
export class Deserialise {
  static fromJson(data: unknown): MathValue {
    return defaultRegistry.decode<MathValue>(data);
  }

  static deserialise(json: string): MathValue {
    return Deserialise.fromJson(JSON.parse(json));
  }

  static vec2 = (data: unknown): Vec2 => vec2Codec.decode(data);
  static mat3 = (data: unknown): Mat3 => mat3Codec.decode(data);
  static angle = (data: unknown): Angle => angleCodec.decode(data);
  static frame2 = (data: unknown): Frame2 => frame2Codec.decode(data);
  static epsilon = (data: unknown): Epsilon => epsilonCodec.decode(data);
  static interval2 = (data: unknown): Interval2 => interval2Codec.decode(data);
  static aabb2 = (data: unknown): Aabb2 => aabb2Codec.decode(data);
  static line2 = (data: unknown): Line2 => line2Codec.decode(data);
  static ray2 = (data: unknown): Ray2 => ray2Codec.decode(data);
  static infiniteLine2 = (data: unknown): InfiniteLine2 => infiniteLine2Codec.decode(data);
  static hesse2 = (data: unknown): Hesse2 => hesse2Codec.decode(data);
  static polyline2 = (data: unknown): Polyline2 => polyline2Codec.decode(data);
  static polygon2 = (data: unknown): Polygon2 => polygon2Codec.decode(data);
  static circle2 = (data: unknown): Circle2 => circle2Codec.decode(data);
  static triMesh2 = (data: unknown): TriMesh2 => triMesh2Codec.decode(data);
  static gridCell2 = (data: unknown): GridCell2 => gridCell2Codec.decode(data);
  static axis = (data: unknown): Axis => axisCodec.decode(data);
  static grid2 = (data: unknown): Grid2 => grid2Codec.decode(data);
  static gridLine2 = (data: unknown): GridLine2 => gridLine2Codec.decode(data);
  static gridPolyline2 = (data: unknown): GridPolyline2 => gridPolyline2Codec.decode(data);
  static gridPolygon2 = (data: unknown): GridPolygon2 => gridPolygon2Codec.decode(data);
  static gridRectangle2 = (data: unknown): GridRectangle2 => gridRectangle2Codec.decode(data);
  static gridCell2Collection = (data: unknown): GridCell2Collection => gridCell2CollectionCodec.decode(data);
}
