import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { vec2ToTuple } from '../../../core/frame';
import type { Point3 } from '../types';

export function fittedPolylinePoints(
  fit: (point: Vec2) => Vec2,
  vertices: readonly Vec2[],
  closed: boolean,
  offset: Vec2,
): Point3[] {
  if (vertices.length === 0) return [];
  const fitted = vertices.map(fit);
  const outline = closed ? [...fitted, fitted[0]!] : fitted;
  return outline.map((point) => vec2ToTuple(point, offset));
}

export function fittedLinePoints(fit: (point: Vec2) => Vec2, from: Vec2, to: Vec2, offset: Vec2): Point3[] {
  return [vec2ToTuple(fit(from), offset), vec2ToTuple(fit(to), offset)];
}

export function fittedSegmentPoints(from: Vec2, to: Vec2, offset: Vec2): Point3[] {
  return [vec2ToTuple(from, offset), vec2ToTuple(to, offset)];
}
