import { Aabb2 } from '@dirty-geometry/vec2/bounds/aabb2';
import { Circle2 } from '@dirty-geometry/vec2/geometry/regions/circle2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Hesse2 } from '@dirty-geometry/vec2/geometry/primitives/hesse2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { fitPointsToFrame, FRAME_CONTENT_MARGIN, FRAME_MAX, FRAME_MIN } from '../../core/frame';
import { lineLikeFramePoints } from '../display/shared/line-like';
import { circleDisplayPoints } from '../display/shared/circle';
import { INFINITE_DISPLAY_SCALE, type GeometryFrameOptions } from './constants';

export { INFINITE_DISPLAY_SCALE, type GeometryFrameOptions };

export function aabbDisplayAnchor(box: Aabb2): Vec2 {
  const x =
    Number.isFinite(box.x.min) && Number.isFinite(box.x.max)
      ? (box.x.min + box.x.max) / 2
      : Number.isFinite(box.x.min)
        ? box.x.min
        : Number.isFinite(box.x.max)
          ? box.x.max
          : 0;
  const y =
    Number.isFinite(box.y.min) && Number.isFinite(box.y.max)
      ? (box.y.min + box.y.max) / 2
      : Number.isFinite(box.y.min)
        ? box.y.min
        : Number.isFinite(box.y.max)
          ? box.y.max
          : 0;

  return new Vec2(x, y);
}

export function finiteDisplayAabb(box: Aabb2, scale = INFINITE_DISPLAY_SCALE, anchor?: Vec2): Aabb2 {
  const ref = anchor ?? aabbDisplayAnchor(box);

  const resolveAxis = (min: number, max: number, refCoord: number): [number, number] => {
    if (Number.isFinite(min) && Number.isFinite(max)) return [min, max];
    if (Number.isFinite(min) && !Number.isFinite(max)) return [min, min + scale];
    if (!Number.isFinite(min) && Number.isFinite(max)) return [max - scale, max];
    return [refCoord - scale, refCoord + scale];
  };

  const [xMin, xMax] = resolveAxis(box.x.min, box.x.max, ref.x);
  const [yMin, yMax] = resolveAxis(box.y.min, box.y.max, ref.y);
  return Aabb2.fromMinMax(new Vec2(xMin, yMin), new Vec2(xMax, yMax));
}

function fittedDisplayAabbRect(fit: (point: Vec2) => Vec2, box: Aabb2): { min: Vec2; max: Vec2 } | null {
  const finiteExtent = (min: number, max: number): [number, number] | null => {
    if (Number.isFinite(min) && Number.isFinite(max)) return [min, max];
    if (Number.isFinite(min)) return [min, min];
    if (Number.isFinite(max)) return [max, max];
    return null;
  };

  const xExtent = finiteExtent(box.x.min, box.x.max);
  const yExtent = finiteExtent(box.y.min, box.y.max);

  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;

  if (xExtent) {
    const y0 = yExtent?.[0] ?? 0;
    const y1 = yExtent?.[1] ?? y0;
    const fittedXs = [
      fit(new Vec2(xExtent[0], y0)).x,
      fit(new Vec2(xExtent[0], y1)).x,
      fit(new Vec2(xExtent[1], y0)).x,
      fit(new Vec2(xExtent[1], y1)).x,
    ];
    minX = Math.min(...fittedXs);
    maxX = Math.max(...fittedXs);
  } else {
    minX = FRAME_MIN;
    maxX = FRAME_MAX;
  }

  if (yExtent) {
    const x0 = xExtent?.[0] ?? 0;
    const x1 = xExtent?.[1] ?? x0;
    const fittedYs = [
      fit(new Vec2(x0, yExtent[0])).y,
      fit(new Vec2(x1, yExtent[0])).y,
      fit(new Vec2(x0, yExtent[1])).y,
      fit(new Vec2(x1, yExtent[1])).y,
    ];
    minY = Math.min(...fittedYs);
    maxY = Math.max(...fittedYs);
  } else {
    minY = FRAME_MIN;
    maxY = FRAME_MAX;
  }

  minX = Math.max(FRAME_MIN, minX);
  minY = Math.max(FRAME_MIN, minY);
  maxX = Math.min(FRAME_MAX, maxX);
  maxY = Math.min(FRAME_MAX, maxY);

  if (minX > maxX || minY > maxY) return null;

  return { min: new Vec2(minX, minY), max: new Vec2(maxX, maxY) };
}

export function aabbFrameClippedCorners(fit: (point: Vec2) => Vec2, box: Aabb2): Vec2[] {
  const display = box.isInfinite() ? finiteDisplayAabb(box) : box;
  const rect = fittedDisplayAabbRect(fit, display);
  if (!rect) return [];

  const { min, max } = rect;
  return [min, new Vec2(max.x, min.y), max, new Vec2(min.x, max.y)];
}

export function geometryFramePoints(geometry: Geometry2, options: GeometryFrameOptions = {}): Vec2[] {
  const definitionGeometry = options.definitionGeometry ?? false;

  if (geometry instanceof Vec2) {
    return [geometry.clone()];
  }

  if (geometry instanceof Line2) {
    return [geometry.from.clone(), geometry.to.clone()];
  }

  if (geometry instanceof Ray2 || geometry instanceof InfiniteLine2) {
    return lineLikeFramePoints(geometry, definitionGeometry);
  }

  if (geometry instanceof Hesse2) {
    return lineLikeFramePoints(geometry.infiniteLine(), definitionGeometry);
  }

  if (geometry instanceof Circle2) {
    return circleDisplayPoints(geometry);
  }

  if (geometry instanceof Polyline2 || geometry instanceof Polygon2) {
    return geometry.vertices.map((vertex) => vertex.clone());
  }

  if (geometry instanceof Aabb2) {
    if (geometry.isInfinite()) {
      return [aabbDisplayAnchor(geometry)];
    }
    return geometry.corners().map((corner) => corner.clone());
  }

  return geometry.vertices.map((vertex) => vertex.clone());
}

export function frameAnchorPoints(geometries: readonly Geometry2[], options: GeometryFrameOptions = {}): Vec2[] {
  const points: Vec2[] = [];
  for (const geometry of geometries) {
    points.push(...geometryFramePoints(geometry, options));
  }
  return points;
}

export function fitGeometriesToFrame(
  geometries: readonly Geometry2[],
  options: GeometryFrameOptions = {},
): (point: Vec2) => Vec2 {
  const margin = options.margin ?? FRAME_CONTENT_MARGIN;
  return fitPointsToFrame(frameAnchorPoints(geometries, options), margin);
}
