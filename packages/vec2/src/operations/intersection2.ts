import type { LineLike2, LineLike2IntersectionResult } from '../geometry/kinds';
import { Interval2 } from '../bounds/interval2';
import { Epsilon } from '../core/epsilon';
import type { Vec2 } from '../core/vec2';
import { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { Line2 } from '../geometry/primitives/line2';
import { Ray2 } from '../geometry/primitives/ray2';

export type { LineLike2IntersectionResult } from '../geometry/kinds';

export type SegmentCrossing = {
  point: Vec2;
  /** Index into the input `segments` array. */
  i: number;
  /** Index into the input `segments` array. */
  j: number;
};

/** Intersections between line-like geometries. */
export class Intersection2 {
  private constructor() {}

  /** Intersection of two line-likes: nothing, a point, or the overlap when they are collinear. */
  static lines(a: LineLike2, b: LineLike2): LineLike2IntersectionResult {
    const dir0 = a.infiniteLine().direction;
    const dir1 = b.infiniteLine().direction;

    if (dir0.parallel(dir1)) {
      return parallelIntersection(a, b);
    }

    const denom = dir0.crossProduct(dir1);
    const delta = b.infiniteLine().through.subtract(a.infiniteLine().through);
    const t0 = delta.crossProduct(dir1) / denom;
    const t1 = delta.crossProduct(dir0) / denom;

    // Tolerances are distances: convert them into each line's parameter space.
    if (!containsWithin(a.interval(), t0, Epsilon.parameter(dir0.length()))) {
      return null;
    }

    if (!containsWithin(b.interval(), t1, Epsilon.parameter(dir1.length()))) {
      return null;
    }

    return a.infiniteLine().evaluate(t0);
  }

  /**
   * Left-to-right sweep reporting all point intersections among finite segments.
   *
   * Segments are processed by ascending min-x. The active set holds every earlier
   * segment whose x-span still overlaps the current one, so each intersecting pair
   * is tested exactly once when the right-hand segment is opened.
   */
  static segmentCrossings(segments: readonly Line2[], slack: Epsilon = Epsilon.preferIn): SegmentCrossing[] {
    const ordered = segments
      .map((segment, index) => {
        const minX = Math.min(segment.from.x, segment.to.x);
        const maxX = Math.max(segment.from.x, segment.to.x);
        const minY = Math.min(segment.from.y, segment.to.y);
        const maxY = Math.max(segment.from.y, segment.to.y);
        return { index, segment, minX, maxX, minY, maxY };
      })
      .sort((a, b) => a.minX - b.minX || a.index - b.index);

    const active: typeof ordered = [];
    const crossings: SegmentCrossing[] = [];
    const seen = new Set<number>();

    for (const current of ordered) {
      // Drop segments that can no longer overlap current in x.
      let kept = 0;
      for (const prior of active) {
        if (prior.maxX + slack.value >= current.minX) active[kept++] = prior;
      }
      active.length = kept;

      for (const prior of active) {
        // Bounding boxes that miss each other (in y) cannot cross; skip the exact test.
        if (prior.maxY + slack.value < current.minY || current.maxY + slack.value < prior.minY) continue;
        const hit = Intersection2.lines(prior.segment, current.segment);
        if (hit?.type !== 'Vec2') continue;

        const lo = Math.min(prior.index, current.index);
        const hi = Math.max(prior.index, current.index);
        const key = lo * segments.length + hi;
        if (seen.has(key)) continue;
        seen.add(key);

        crossings.push({ point: hit.clone(), i: prior.index, j: current.index });
      }

      active.push(current);
    }

    return crossings;
  }
}

function containsWithin(interval: Interval2, t: number, tolerance: number): boolean {
  return t >= interval.min - tolerance && t <= interval.max + tolerance;
}

function parallelIntersection(first: LineLike2, second: LineLike2): LineLike2IntersectionResult {
  if (first.infiniteLine().distanceToPoint(second.infiniteLine().through) >= Epsilon.value) {
    return null;
  }

  const mappedSecond = mapIntervalOnto(second, first);
  const own = first.interval();
  const min = Math.max(own.min, mappedSecond.min);
  const max = Math.min(own.max, mappedSecond.max);

  if (min > max + Epsilon.parameter(first.infiniteLine().direction.length())) {
    return null;
  }

  return geometryFromOverlap(first.infiniteLine(), new Interval2(Math.min(min, max), Math.max(min, max)));
}

/** Maps `from`'s parameter interval into `onto`'s parameter space. */
function mapIntervalOnto(from: LineLike2, onto: LineLike2): Interval2 {
  const ontoDir = onto.infiniteLine().direction;
  const ontoDirLenSq = ontoDir.dot(ontoDir);
  const origin = onto.infiniteLine().closestParameterForPoint(from.infiniteLine().through);
  const fromDirection = from.infiniteLine().direction;
  // A degenerate direction is a point; any other direction maps exactly, however long or short.
  if (fromDirection.length() < Epsilon.value) {
    return new Interval2(origin, origin);
  }
  return from.interval().mapLinear(origin, fromDirection.dot(ontoDir) / ontoDirLenSq);
}

function geometryFromOverlap(line: InfiniteLine2, overlap: Interval2): LineLike2IntersectionResult {
  if (overlap.isFullyInfinite()) {
    return new InfiniteLine2(line.through.clone(), line.direction.clone());
  }

  if (overlap.isInfinite()) {
    if (Number.isFinite(overlap.min)) {
      return new Ray2(line.evaluate(overlap.min), line.direction.clone());
    }

    if (Number.isFinite(overlap.max)) {
      return new Ray2(line.evaluate(overlap.max), line.direction.negate());
    }
  }

  const from = line.evaluate(overlap.min);
  const to = line.evaluate(overlap.max);

  if (from.distance(to) < Epsilon.value) {
    return from;
  }

  return new Line2(from, to);
}
