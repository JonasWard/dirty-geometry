import { Aabb2 } from '../bounds/aabb2';
import { Interval2 } from '../bounds/interval2';
import { assertNever } from '../core/assert';
import { Epsilon } from '../core/epsilon';
import { Vec2 } from '../core/vec2';
import type { Polyline2 } from '../geometry/curves/polyline2';
import type { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { Line2 } from '../geometry/primitives/line2';
import type { Ray2 } from '../geometry/primitives/ray2';
import type { Circle2 } from '../geometry/regions/circle2';
import type { Container2, Geometry2 } from '../geometry/kinds';
import type { Hesse2 } from '../geometry/primitives/hesse2';
import { Polygon2 } from '../geometry/regions/polygon2';
import type { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { intersectionLines } from './intersection/line2-like';

export type { Geometry2 } from '../geometry/kinds';

type LineLike2 = InfiniteLine2 | Ray2 | Line2;

/**
 * True when `a` and `b` share at least one point.
 * Touching counts as overlap with `Epsilon.preferIn`; `Epsilon.preferOut` requires proper overlap.
 */
export class Overlap2 {
  /** `InfiniteLine2` and `Hesse2` act as half-planes (`signedDistance <= 0`); rays are unbounded. */
  static overlaps(a: Geometry2, b: Geometry2, slack: Epsilon = Epsilon.preferIn): boolean {
    const first = normalise(a);
    const second = normalise(b);

    if (first.type !== 'InfiniteLine2' && second.type !== 'InfiniteLine2') {
      if (!aabbOverlap(geometryAabb(first), geometryAabb(second), slack)) {
        return false;
      }
    }

    return overlapPair(clipRayTo(first, second, slack), clipRayTo(second, first, slack), slack);
  }
}

type NormalisedGeometry2 = Exclude<Geometry2, Hesse2>;

/** A Hesse2 is the same half-plane as its infinite line. */
function normalise(geometry: Geometry2): NormalisedGeometry2 {
  return geometry.type === 'Hesse2' ? geometry.infiniteLine() : geometry;
}

/**
 * Against a bounded partner a ray only matters up to the partner's bounds, so cut it to a segment
 * that covers them. Unbounded partners (half-planes, rays, infinite boxes) keep the ray.
 */
function clipRayTo(geometry: NormalisedGeometry2, partner: NormalisedGeometry2, slack: Epsilon): NormalisedGeometry2 {
  if (geometry.type !== 'Ray2' || partner.type === 'InfiniteLine2' || partner.type === 'Ray2') return geometry;

  const bounds = geometryAabb(partner);
  if (bounds.isInfinite()) return geometry;

  const lengthSq = geometry.direction.dot(geometry.direction);
  if (lengthSq < Epsilon.sq) return geometry.start;

  const pad = Math.abs(slack.value);
  const corners = Aabb2.fromPoints(bounds.min().subtract(new Vec2(pad, pad)), bounds.max().add(new Vec2(pad, pad)));
  const reach = Math.max(
    1,
    ...corners.corners().map((corner) => corner.subtract(geometry.start).dot(geometry.direction) / lengthSq),
  );
  return new Line2(geometry.start, geometry.evaluate(reach));
}

function overlapPair(a: NormalisedGeometry2, b: NormalisedGeometry2, slack: Epsilon): boolean {
  if (a.type === 'InfiniteLine2' && b.type !== 'InfiniteLine2') {
    return overlapsHalfPlane(a, b, slack);
  }
  if (b.type === 'InfiniteLine2' && a.type !== 'InfiniteLine2') {
    return overlapsHalfPlane(b, a, slack);
  }

  if (a.type === 'Vec2') {
    return overlapsPoint(a, b, slack);
  }
  if (b.type === 'Vec2') {
    return overlapsPoint(b, a, slack);
  }

  if (isLineLike(a) && isLineLike(b)) {
    return overlapsLineLikes(a, b, slack);
  }

  if (isCurve(a) && isCurve(b)) {
    return overlapsCurves(a, b, slack);
  }

  if (a.type === 'Circle2') {
    return overlapsCircle(a, b, slack);
  }
  if (b.type === 'Circle2') {
    return overlapsCircle(b, a, slack);
  }

  if (a.type === 'Aabb2') {
    return overlapsAabb(a, b, slack);
  }
  if (b.type === 'Aabb2') {
    return overlapsAabb(b, a, slack);
  }

  return overlapsFilledRegions(a, b, slack);
}

function overlapsPoint(point: Vec2, other: NormalisedGeometry2, slack: Epsilon): boolean {
  if (other.type === 'Vec2') {
    return withinDistance(point.distance(other), slack);
  }

  if (other.type === 'Line2' || other.type === 'Polyline2' || other.type === 'Ray2') {
    return withinDistance(other.distanceToPoint(point), slack);
  }

  if (other.type === 'Circle2') {
    return withinSeparation(other.signedDistance(point), slack);
  }

  if (other.type === 'Aabb2') {
    return pointInContainer(other, point, slack);
  }

  return pointInContainer(other, point, slack);
}

function overlapsLineLikes(a: LineLike2, b: LineLike2, slack: Epsilon): boolean {
  const hit = intersectionLines(a, b);
  if (hit === null) {
    return false;
  }

  if (slack.value >= 0) {
    return true;
  }

  if (hit.type === 'Vec2') {
    return false;
  }

  if (hit.type === 'Line2') {
    return hit.length() > -slack.value;
  }

  return true;
}

function overlapsCurves(a: Line2 | Polyline2 | Ray2, b: Line2 | Polyline2 | Ray2, slack: Epsilon): boolean {
  for (const segmentA of segmentsOf(a)) {
    for (const segmentB of segmentsOf(b)) {
      if (overlapsSegments(segmentA, segmentB, slack)) {
        return true;
      }
    }
  }

  return false;
}

function overlapsSegments(a: Line2, b: Line2, slack: Epsilon): boolean {
  if (overlapsLineLikes(a, b, slack)) {
    return true;
  }

  if (segmentsCross(a.from, a.to, b.from, b.to, slack)) {
    return true;
  }

  return (
    withinDistance(a.distanceToPoint(b.from), slack) ||
    withinDistance(a.distanceToPoint(b.to), slack) ||
    withinDistance(b.distanceToPoint(a.from), slack) ||
    withinDistance(b.distanceToPoint(a.to), slack)
  );
}

function overlapsCircle(circle: Circle2, other: NormalisedGeometry2, slack: Epsilon): boolean {
  if (other.type === 'Circle2') {
    const gap = circle.center.distance(other.center) - circle.radius - other.radius;
    return withinSeparation(gap, slack);
  }

  if (other.type === 'Line2') {
    return withinSeparation(other.distanceToPoint(circle.center) - circle.radius, slack);
  }

  if (other.type === 'Polyline2') {
    for (const segment of other.segments()) {
      if (overlapsCircle(circle, segment, slack)) {
        return true;
      }
    }
    return false;
  }

  if (other.type === 'Ray2') {
    return withinSeparation(other.distanceToPoint(circle.center) - circle.radius, slack);
  }

  if (other.type === 'Aabb2') {
    return overlapsCircle(circle, Polygon2.fromAabb2(other), slack);
  }

  for (const point of verticesOf(other)) {
    if (withinSeparation(circle.signedDistance(point), slack)) {
      return true;
    }
  }

  if (other.type === 'Polygon2' || other.type === 'TriMesh2') {
    if (pointInContainer(other, circle.center, slack)) {
      return true;
    }
  }

  for (const edge of edgesOf(other)) {
    if (overlapsCircle(circle, edge, slack)) {
      return true;
    }
  }

  return false;
}

/** `plane` is the half-plane `signedDistance <= 0`; a linear distance is smallest at a vertex or towards infinity. */
function overlapsHalfPlane(plane: InfiniteLine2, other: NormalisedGeometry2, slack: Epsilon): boolean {
  switch (other.type) {
    case 'Vec2':
      return inside(plane.signedDistance(other), slack);
    case 'Circle2':
      return withinSeparation(plane.signedDistance(other.center) - other.radius, slack);
    case 'Ray2': {
      if (inside(plane.signedDistance(other.start), slack)) return true;
      // Heading into the half-plane reaches it eventually.
      return plane.signedDistance(other.evaluate(1)) < plane.signedDistance(other.start);
    }
    case 'InfiniteLine2':
      return overlapsLineLikes(plane, other, slack);
    case 'Aabb2':
      if (other.isInfinite()) return true;
      return other.corners().some((corner) => inside(plane.signedDistance(corner), slack));
    case 'Line2':
    case 'Polyline2':
    case 'Polygon2':
    case 'TriMesh2':
      return verticesOf(other).some((vertex) => inside(plane.signedDistance(vertex), slack));
    default:
      return assertNever(other, 'Overlap2: unknown geometry');
  }
}

function overlapsAabb(box: Aabb2, other: NormalisedGeometry2, slack: Epsilon): boolean {
  if (other.type === 'Aabb2') {
    return aabbOverlap(box, other, slack);
  }

  if (other.type === 'Circle2') {
    return overlapsCircle(other, box, slack);
  }

  // The box may lie entirely inside a region without any of the region's vertices or edges touching it.
  if ((other.type === 'Polygon2' || other.type === 'TriMesh2') && !box.isInfinite()) {
    if (box.corners().some((corner) => pointInContainer(other, corner, slack))) {
      return true;
    }
  }

  for (const point of verticesOf(other)) {
    if (pointInContainer(box, point, slack)) {
      return true;
    }
  }

  for (const edge of edgesOf(other)) {
    if (overlapsAabbSegment(box, edge, slack)) {
      return true;
    }
  }

  return false;
}

function overlapsAabbSegment(box: Aabb2, segment: Line2, slack: Epsilon): boolean {
  if (pointInContainer(box, segment.from, slack) || pointInContainer(box, segment.to, slack)) {
    return true;
  }

  for (const edge of Polygon2.fromAabb2(box).segments()) {
    if (overlapsSegments(segment, edge, slack)) {
      return true;
    }
  }

  return false;
}

function overlapsFilledRegions(a: NormalisedGeometry2, b: NormalisedGeometry2, slack: Epsilon): boolean {
  for (const point of verticesOf(a)) {
    if (overlapsPoint(point, b, slack)) {
      return true;
    }
  }

  for (const point of verticesOf(b)) {
    if (overlapsPoint(point, a, slack)) {
      return true;
    }
  }

  for (const edgeA of edgesOf(a)) {
    for (const edgeB of edgesOf(b)) {
      if (overlapsSegments(edgeA, edgeB, slack)) {
        return true;
      }
    }
  }

  return false;
}

function isCurve(geometry: Geometry2): geometry is Line2 | Polyline2 | Ray2 {
  return geometry.type === 'Line2' || geometry.type === 'Polyline2' || geometry.type === 'Ray2';
}

function isLineLike(geometry: Geometry2): geometry is LineLike2 {
  return geometry.type === 'Line2' || geometry.type === 'Ray2' || geometry.type === 'InfiniteLine2';
}

function geometryAabb(geometry: Geometry2): Aabb2 {
  if (geometry.type === 'Vec2') {
    return Aabb2.fromPoints(geometry);
  }

  if (geometry.type === 'Aabb2') {
    return geometry;
  }

  return geometry.aabb2();
}

function aabbOverlap(a: Aabb2, b: Aabb2, slack: Epsilon): boolean {
  return intervalOverlap(a.x, b.x, slack) && intervalOverlap(a.y, b.y, slack);
}

function intervalOverlap(a: Interval2, b: Interval2, slack: Epsilon): boolean {
  const s = slack.value;
  if (s < 0) {
    return a.max > b.min - s && b.max > a.min - s;
  }

  return a.max + s >= b.min && b.max + s >= a.min;
}

function inside(value: number, slack: Epsilon): boolean {
  const s = slack.value;
  return s < 0 ? value < s : value <= s;
}

function withinSeparation(separation: number, slack: Epsilon): boolean {
  const s = slack.value;
  return s < 0 ? separation < s : separation <= s;
}

function withinDistance(distance: number, slack: Epsilon): boolean {
  const s = slack.value;
  return s < 0 ? distance < -s : distance <= s;
}

function pointInContainer(container: Container2, point: Vec2, slack: Epsilon): boolean {
  if (container.type === 'TriMesh2') {
    return container.containsPoint(point, slack);
  }

  if (container.type === 'Aabb2') {
    return container.x.contains(point.x, slack) && container.y.contains(point.y, slack);
  }

  return inside(container.signedDistance(point), slack);
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2, slack: Epsilon): boolean {
  const o1 = Vec2.orient(a, b, c);
  const o2 = Vec2.orient(a, b, d);
  const o3 = Vec2.orient(c, d, a);
  const o4 = Vec2.orient(c, d, b);
  const eps = slack.sq;

  return (
    Math.sign(o1) !== Math.sign(o2) &&
    Math.sign(o3) !== Math.sign(o4) &&
    Math.abs(o1) > eps &&
    Math.abs(o2) > eps &&
    Math.abs(o3) > eps &&
    Math.abs(o4) > eps
  );
}

function segmentsOf(curve: Line2 | Polyline2 | Ray2): Line2[] {
  if (curve.type === 'Line2') {
    return [curve];
  }

  if (curve.type === 'Polyline2') {
    return curve.segments();
  }

  return [Line2.definitionOf(curve)];
}

function verticesOf(geometry: Geometry2): Vec2[] {
  if (geometry.type === 'Vec2') {
    return [geometry];
  }

  if (geometry.type === 'Line2') {
    return [geometry.from, geometry.to];
  }

  if (geometry.type === 'Polyline2' || geometry.type === 'Polygon2') {
    return [...geometry.vertices];
  }

  if (geometry.type === 'TriMesh2') {
    return [...geometry.vertices];
  }

  if (geometry.type === 'Ray2') {
    return [geometry.start, geometry.evaluate(1)];
  }

  return [];
}

function edgesOf(geometry: Geometry2): Line2[] {
  if (geometry.type === 'Line2') {
    return [geometry];
  }

  if (geometry.type === 'Polyline2') {
    return geometry.segments();
  }

  if (geometry.type === 'Polygon2') {
    return geometry.segments();
  }

  if (geometry.type === 'TriMesh2') {
    const edges: Line2[] = [];
    for (const [i, j, k] of geometry.triangles) {
      const a = geometry.vertices[i]!;
      const b = geometry.vertices[j]!;
      const c = geometry.vertices[k]!;
      edges.push(new Line2(a, b), new Line2(b, c), new Line2(c, a));
    }
    return edges;
  }

  if (geometry.type === 'Ray2') {
    return [Line2.definitionOf(geometry)];
  }

  return [];
}
