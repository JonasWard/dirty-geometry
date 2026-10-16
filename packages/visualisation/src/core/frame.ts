import type { LineLike2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';

export const FRAME_MIN = -2;
export const FRAME_MAX = 2;
export const FRAME_SIZE = FRAME_MAX - FRAME_MIN;
export const CELL_GAP = 1;
export const CELL_PITCH = FRAME_SIZE + CELL_GAP;
/** Inset from the frame border so content sits inside with breathing room. */
export const FRAME_CONTENT_MARGIN = 0.35;

export function vec2ToTuple(v: Vec2, offset: Vec2 = new Vec2()): [number, number, number] {
  return [v.x + offset.x, v.y + offset.y, 0];
}

/** Clip a segment to the display frame square `[FRAME_MIN, FRAME_MAX]²` in fitted coordinates. */
export function clipSegmentToDisplayFrame(from: Vec2, to: Vec2): [Vec2, Vec2] | null {
  return clipSegmentToFrame(from, to);
}

/** Clip a ray (t ≥ 0) to the display frame square `[FRAME_MIN, FRAME_MAX]²` in fitted coordinates. */
export function clipRayToDisplayFrame(start: Vec2, direction: Vec2): [Vec2, Vec2] | null {
  return clipRayToFrame(start, direction);
}

/**
 * Clip an infinite line to the display frame square `[FRAME_MIN, FRAME_MAX]²` in fitted coordinates.
 * `null` when it misses the frame or has no direction.
 */
export function clipInfiniteLineToDisplayFrame(through: Vec2, direction: Vec2): [Vec2, Vec2] | null {
  if (direction.length() < 1e-9) return null;

  let tMin = -Infinity;
  let tMax = Infinity;

  const clip = (component: number, origin: number, min: number, max: number): boolean => {
    if (Math.abs(component) < 1e-9) {
      return origin >= min && origin <= max;
    }

    const t1 = (min - origin) / component;
    const t2 = (max - origin) / component;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMin <= tMax;
  };

  if (!clip(direction.x, through.x, FRAME_MIN, FRAME_MAX) || !clip(direction.y, through.y, FRAME_MIN, FRAME_MAX)) {
    return null;
  }

  return [through.add(direction.scale(tMin)), through.add(direction.scale(tMax))];
}

/**
 * Uniformly scale and center points into the frame content box
 * `[FRAME_MIN + margin, FRAME_MAX - margin]²`.
 */
export function fitPointsToFrame(points: readonly Vec2[], margin = FRAME_CONTENT_MARGIN): (point: Vec2) => Vec2 {
  if (points.length === 0) {
    return (point) => point.clone();
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = Math.max(maxX - minX, 1e-9);
  const height = Math.max(maxY - minY, 1e-9);
  const contentSize = FRAME_SIZE - 2 * margin;
  const scale = contentSize / Math.max(width, height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return (point: Vec2) => new Vec2((point.x - centerX) * scale, (point.y - centerY) * scale);
}

function clipSegmentToFrame(from: Vec2, to: Vec2): [Vec2, Vec2] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const clip = (p: number, q: number): boolean => {
    if (p === 0) {
      return q >= 0;
    }

    const r = q / p;

    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }

    return true;
  };

  if (
    clip(-dx, from.x - FRAME_MIN) &&
    clip(dx, FRAME_MAX - from.x) &&
    clip(-dy, from.y - FRAME_MIN) &&
    clip(dy, FRAME_MAX - from.y)
  ) {
    return [from.add(to.subtract(from).scale(t0)), from.add(to.subtract(from).scale(t1))];
  }

  return null;
}

function clipRayToFrame(start: Vec2, direction: Vec2): [Vec2, Vec2] | null {
  if (direction.length() < 1e-9) {
    return start.x >= FRAME_MIN && start.x <= FRAME_MAX && start.y >= FRAME_MIN && start.y <= FRAME_MAX
      ? [start, start]
      : null;
  }

  let tMin = 0;
  let tMax = Infinity;

  const clip = (component: number, origin: number, min: number, max: number): boolean => {
    if (Math.abs(component) < 1e-9) {
      return origin >= min && origin <= max;
    }

    const t1 = (min - origin) / component;
    const t2 = (max - origin) / component;
    const enter = Math.min(t1, t2);
    const exit = Math.max(t1, t2);

    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, exit);
    return tMin <= tMax;
  };

  if (
    !clip(direction.x, start.x, FRAME_MIN, FRAME_MAX) ||
    !clip(direction.y, start.y, FRAME_MIN, FRAME_MAX) ||
    tMax < 0
  ) {
    return null;
  }

  const tStart = Math.max(tMin, 0);
  const tEnd = tMax;

  if (tStart > tEnd) {
    return null;
  }

  return [start.add(direction.scale(tStart)), start.add(direction.scale(tEnd))];
}

export function frameCorners(offset: Vec2): [number, number, number][] {
  return [
    vec2ToTuple(new Vec2(FRAME_MIN, FRAME_MIN), offset),
    vec2ToTuple(new Vec2(FRAME_MAX, FRAME_MIN), offset),
    vec2ToTuple(new Vec2(FRAME_MAX, FRAME_MAX), offset),
    vec2ToTuple(new Vec2(FRAME_MIN, FRAME_MAX), offset),
    vec2ToTuple(new Vec2(FRAME_MIN, FRAME_MIN), offset),
  ];
}

export function lineLikeKind(line: LineLike2): string {
  if (line.type === 'Line2') return 'Line2';
  if (line.type === 'Ray2') return 'Ray2';
  return 'InfiniteLine2';
}

export function gridOffset(index: number, columns: number, rowOffset = 0): Vec2 {
  const row = Math.floor(index / columns) + rowOffset;
  const col = index % columns;
  const centerX = col * CELL_PITCH;
  const centerY = -row * CELL_PITCH;

  return new Vec2(centerX, centerY);
}

export function missMarkerPosition(offset: Vec2): [number, number, number] {
  return [offset.x, offset.y - FRAME_MAX + 0.35, 0];
}

export function labelPosition(offset: Vec2): [number, number, number] {
  return [offset.x, offset.y + FRAME_MAX + 0.35, 0];
}
