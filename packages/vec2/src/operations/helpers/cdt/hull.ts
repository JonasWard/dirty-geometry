import { orient } from '../../../core/predicates';
import type { Vec2 } from '../../../core/vec2';

/**
 * Indices of the convex hull of `points`, counter-clockwise, keeping points that lie on hull edges
 * (a triangulation needs every one of them as a hull vertex). Empty when all points are collinear.
 */
export function convexHullLoop(points: readonly Vec2[]): number[] {
  const order = points
    .map((_, index) => index)
    .sort((i, j) => points[i]!.x - points[j]!.x || points[i]!.y - points[j]!.y);
  if (order.length < 3) return [];

  const chain = (indices: readonly number[]) => {
    const hull: number[] = [];
    for (const index of indices) {
      while (
        hull.length >= 2 &&
        orient(points[hull[hull.length - 2]!]!, points[hull[hull.length - 1]!]!, points[index]!) < 0
      ) {
        hull.pop();
      }
      hull.push(index);
    }
    return hull;
  };

  const lower = chain(order);
  const upper = chain([...order].reverse());
  const loop = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const hasArea = loop.some(
    (_, i) =>
      orient(points[loop[i]!]!, points[loop[(i + 1) % loop.length]!]!, points[loop[(i + 2) % loop.length]!]!) !== 0,
  );
  return hasArea ? loop : [];
}
