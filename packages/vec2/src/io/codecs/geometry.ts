import { Polyline2 } from '../../geometry/curves/polyline2';
import { Hesse2 } from '../../geometry/primitives/hesse2';
import { InfiniteLine2 } from '../../geometry/primitives/infinite-line2';
import { Line2 } from '../../geometry/primitives/line2';
import { Ray2 } from '../../geometry/primitives/ray2';
import { Circle2 } from '../../geometry/regions/circle2';
import { Polygon2 } from '../../geometry/regions/polygon2';
import { TriMesh2 } from '../../geometry/regions/tri-mesh2';
import { codec } from '../codec';
import {
  isCircle2Json,
  isHesse2Json,
  isInfiniteLine2Json,
  isLine2Json,
  isPolygon2Json,
  isPolyline2Json,
  isRay2Json,
  isTriMesh2Json,
} from '../json-guards';
import { vec2Codec } from './core';

const vec2 = (json: unknown) => vec2Codec.decode(json);

export const line2Codec = codec(Line2.type, isLine2Json, (json) => new Line2(vec2(json.from), vec2(json.to)));

export const ray2Codec = codec(Ray2.type, isRay2Json, (json) => new Ray2(vec2(json.start), vec2(json.direction)));

export const infiniteLine2Codec = codec(
  InfiniteLine2.type,
  isInfiniteLine2Json,
  (json) => new InfiniteLine2(vec2(json.through), vec2(json.direction)),
);

export const hesse2Codec = codec(Hesse2.type, isHesse2Json, (json) => new Hesse2(vec2(json.normal), json.offset));

export const polyline2Codec = codec(Polyline2.type, isPolyline2Json, (json) => new Polyline2(json.vertices.map(vec2)));

export const polygon2Codec = codec(Polygon2.type, isPolygon2Json, (json) => new Polygon2(json.vertices.map(vec2)));

export const circle2Codec = codec(Circle2.type, isCircle2Json, (json) => new Circle2(vec2(json.center), json.radius));

/** Rebuilds the mesh as written: `toJson` comes from an already cleaned mesh, so cleanup is not re-run. */
export const triMesh2Codec = codec(TriMesh2.type, isTriMesh2Json, (json) =>
  TriMesh2.withoutCleanup(
    json.vertices.map(vec2),
    json.triangles.map(([a, b, c]) => [a, b, c] as const),
  ),
);

export const geometryCodecs = [
  line2Codec,
  ray2Codec,
  infiniteLine2Codec,
  hesse2Codec,
  polyline2Codec,
  polygon2Codec,
  circle2Codec,
  triMesh2Codec,
] as const;
