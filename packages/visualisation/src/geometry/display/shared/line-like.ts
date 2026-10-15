import { Hesse2 } from '@dirty-geometry/vec2/geometry/primitives/hesse2';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import type { LineLike2 } from '@dirty-geometry/vec2/geometry/kinds';
import { intersectionLines } from '@dirty-geometry/vec2/operations/intersection/line2-like';
import {
  clipInfiniteLineToDisplayFrame,
  clipRayToDisplayFrame,
  FRAME_MAX,
  FRAME_MIN,
} from '../../../core/frame';
import { INFINITE_DISPLAY_SCALE } from '../../frame/constants';
import type { GeometryDisplayContext } from '../context';

/** Display-only: unit direction with +x fallback for degenerate vectors. */
function displayUnitDirection(direction: Vec2): Vec2 {
  if (direction.length() < Epsilon.value) {
    return new Vec2(1, 0);
  }
  return direction.unit();
}

export function fitDirection(origin: Vec2, direction: Vec2, fit: (point: Vec2) => Vec2): Vec2 {
  return fit(origin.add(direction)).subtract(fit(origin));
}

function sortCounterClockwise(points: Vec2[]): Vec2[] {
  if (points.length <= 2) return points;
  const center = Vec2.center(...points);
  return [...points].sort(
    (a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
  );
}

function fittedUnboundedSegment(
  origin: Vec2,
  direction: Vec2,
  fit: (point: Vec2) => Vec2,
  bidirectional: boolean,
): Line2 | null {
  const start = fit(origin);
  const dir = fitDirection(origin, direction, fit);
  const tangent = displayUnitDirection(dir);

  if (bidirectional) {
    const clipped = clipInfiniteLineToDisplayFrame(start, dir.length() < 1e-12 ? tangent : dir);
    return clipped ? new Line2(clipped[0], clipped[1]) : null;
  }

  const clipped = clipRayToDisplayFrame(start, dir.length() < 1e-12 ? tangent : dir);
  return clipped ? new Line2(clipped[0], clipped[1]) : null;
}

/** Extend unbounded line-likes in fitted space, then clip to the display frame. */
export function fittedDisplayLineLike(
  line: LineLike2,
  { fit, definitionGeometry = false }: GeometryDisplayContext,
): Line2 | null {
  if (line.type === 'Hesse2') {
    line = line.infiniteLine();
  }

  if (line.type === 'Line2') {
    return new Line2(fit(line.from), fit(line.to));
  }

  if (definitionGeometry) {
    const segment = Line2.definitionOf(line);
    return new Line2(fit(segment.from), fit(segment.to));
  }

  if (line.type === 'Ray2') {
    return fittedUnboundedSegment(line.start, line.direction, fit, false);
  }

  return fittedUnboundedSegment(line.through, line.direction, fit, true);
}

/** Half-plane interior clipped to the display frame in fitted coordinates. */
export function halfPlaneFrameClippedPolygon(line: InfiniteLine2, fit: (point: Vec2) => Vec2): Vec2[] {
  const fittedLine = new InfiniteLine2(fit(line.through), fitDirection(line.through, line.direction, fit));
  const frame = [
    new Vec2(FRAME_MIN, FRAME_MIN),
    new Vec2(FRAME_MAX, FRAME_MIN),
    new Vec2(FRAME_MAX, FRAME_MAX),
    new Vec2(FRAME_MIN, FRAME_MAX),
  ];

  const clipped: Vec2[] = [];

  for (let i = 0; i < frame.length; i++) {
    const current = frame[i]!;
    const next = frame[(i + 1) % frame.length]!;
    const currentInside = fittedLine.signedDistance(current) <= 0;
    const nextInside = fittedLine.signedDistance(next) <= 0;

    if (currentInside) {
      clipped.push(current.clone());
    }

    if (currentInside !== nextInside) {
      const hit = intersectionLines(new Line2(current, next), fittedLine);
      if (hit?.type === 'Vec2') {
        clipped.push(hit.clone());
      }
    }
  }

  return sortCounterClockwise(clipped);
}

export function lineLikeFramePoints(line: Ray2 | InfiniteLine2, definitionGeometry: boolean): Vec2[] {
  if (definitionGeometry) {
    const segment = Line2.definitionOf(line);
    return [segment.from.clone(), segment.to.clone()];
  }

  if (line.type === 'Ray2') {
    return [line.start.clone(), line.evaluate(1)];
  }

  return [line.evaluate(-1), line.evaluate(1)];
}

export function rayDisplayLine(ray: Ray2, scale = INFINITE_DISPLAY_SCALE): Line2 {
  const tangent = displayUnitDirection(ray.direction);
  return new Line2(ray.start.clone(), ray.start.add(tangent.scale(scale)));
}

export function infiniteLineDisplayLine(line: InfiniteLine2, scale = INFINITE_DISPLAY_SCALE): Line2 {
  const tangent = displayUnitDirection(line.direction);
  return new Line2(line.through.subtract(tangent.scale(scale)), line.through.add(tangent.scale(scale)));
}
