import { Aabb2 } from '../bounds/aabb2';
import { Interval2 } from '../bounds/interval2';
import { assertNever } from '../core/assert';
import { Epsilon } from '../core/epsilon';
import { Vec2 } from '../core/vec2';
import { segmentIntersections, type CurveSegment2 } from '../geometry/curves/arc-intersections';
import type { ArcPolyline2 } from '../geometry/curves/arc-polyline2';
import type { Polyline2 } from '../geometry/curves/polyline2';
import type { Arc2 } from '../geometry/primitives/arc2';
import type { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { Line2 } from '../geometry/primitives/line2';
import type { Ray2 } from '../geometry/primitives/ray2';
import { ArcPolygon2 } from '../geometry/regions/arc-polygon2';
import type { Circle2 } from '../geometry/regions/circle2';
import type { Container2, Geometry2 } from '../geometry/kinds';
import type { Hesse2 } from '../geometry/primitives/hesse2';
import { Polygon2 } from '../geometry/regions/polygon2';
import type { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { Intersection2 } from './intersection2';

export type { Geometry2 } from '../geometry/kinds';

type LineLike2 = InfiniteLine2 | Ray2 | Line2;

/**
 * True when `a` and `b` share at least one point.
 * Touching counts as overlap with `Epsilon.preferIn`; `Epsilon.preferOut` requires proper overlap.
 */
export class Overlap2 {
  private constructor() {}

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

  if (isArcKind(a) || isArcKind(b)) {
    return overlapsWithArcs(a, b, slack);
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

  if (
    other.type === 'Line2' ||
    other.type === 'Polyline2' ||
    other.type === 'Ray2' ||
    other.type === 'Arc2' ||
    other.type === 'ArcPolyline2'
  ) {
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
  const hit = Intersection2.lines(a, b);
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
    case 'Arc2':
    case 'ArcPolyline2':
    case 'ArcPolygon2':
      return curveEdgesOf(other).some((edge) => inside(lowestSignedDistance(plane, edge), slack));
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

type ArcKind2 = Arc2 | ArcPolyline2 | ArcPolygon2;

function isArcKind(geometry: Geometry2): geometry is ArcKind2 {
  return geometry.type === 'Arc2' || geometry.type === 'ArcPolyline2' || geometry.type === 'ArcPolygon2';
}

/** Geometries with an interior: a point of the other geometry inside one means overlap. */
function isFilled(geometry: Geometry2): geometry is Circle2 | Polygon2 | ArcPolygon2 | TriMesh2 | Aabb2 {
  return (
    geometry.type === 'Circle2' ||
    geometry.type === 'Polygon2' ||
    geometry.type === 'ArcPolygon2' ||
    geometry.type === 'TriMesh2' ||
    geometry.type === 'Aabb2'
  );
}

/**
 * Overlap where either side has arcs: some boundary or curve edges meet, or a point of one lies in the
 * other's interior. With negative slack, touching edges do not count; only a proper crossing does.
 */
function overlapsWithArcs(a: NormalisedGeometry2, b: NormalisedGeometry2, slack: Epsilon): boolean {
  const edgesA = curveEdgesOf(a);
  const edgesB = curveEdgesOf(b);
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      for (const hit of segmentIntersections(edgeA, edgeB, Epsilon.preferIn)) {
        if (slack.value >= 0 || properlyCrosses(edgeA, edgeB, hit, slack)) return true;
      }
    }
  }

  if (isFilled(b) && pointsOf(a).some((point) => pointInFilled(b, point, slack))) return true;
  if (isFilled(a) && pointsOf(b).some((point) => pointInFilled(a, point, slack))) return true;
  return false;
}

function pointInFilled(
  region: Circle2 | Polygon2 | ArcPolygon2 | TriMesh2 | Aabb2,
  point: Vec2,
  slack: Epsilon,
): boolean {
  return region.type === 'Circle2'
    ? withinSeparation(region.signedDistance(point), slack)
    : pointInContainer(region, point, slack);
}

/** A crossing away from both segments' ends, where the two directions differ. */
function properlyCrosses(a: CurveSegment2, b: CurveSegment2, point: Vec2, slack: Epsilon): boolean {
  const tolerance = Math.abs(slack.value);
  if ([a.from, a.to, b.from, b.to].some((end) => end.distance(point) <= tolerance)) return false;
  const direction = (segment: CurveSegment2) =>
    segment.type === 'Arc2' ? segment.tangent(segment.closestParameterForPoint(point)) : segment.direction().unit();
  return Math.abs(direction(a).crossProduct(direction(b))) > tolerance;
}

/** Straight and circular edges: curves and boundaries, a circle as two half arcs, a box as four sides. */
function curveEdgesOf(geometry: NormalisedGeometry2): CurveSegment2[] {
  switch (geometry.type) {
    case 'Arc2':
      return [geometry];
    case 'ArcPolyline2':
    case 'ArcPolygon2':
      return geometry.segments();
    case 'Circle2':
      return geometry.radius > Epsilon.value ? ArcPolygon2.fromCircle2(geometry).segments() : [];
    case 'Aabb2':
      return geometry.isInfinite() ? [] : [...Polygon2.fromAabb2(geometry).segments()];
    default:
      return edgesOf(geometry);
  }
}

/** Points that lie on a geometry, enough to find it inside a region that none of its edges meet. */
function pointsOf(geometry: NormalisedGeometry2): Vec2[] {
  switch (geometry.type) {
    case 'Arc2':
      return [geometry.from];
    case 'ArcPolyline2':
    case 'ArcPolygon2':
      return [geometry.vertices[0]!];
    case 'Circle2':
      return [geometry.center];
    case 'Aabb2':
      return geometry.isInfinite() ? [] : geometry.corners();
    default:
      return verticesOf(geometry);
  }
}

/** Smallest signed distance from the half-plane's boundary over a segment: at an end, or an arc's lowest point. */
function lowestSignedDistance(plane: InfiniteLine2, segment: CurveSegment2): number {
  let lowest = Math.min(plane.signedDistance(segment.from), plane.signedDistance(segment.to));
  if (segment.type === 'Arc2') {
    const centre = segment.centre();
    const base = plane.signedDistance(centre);
    const down = new Vec2(
      base - plane.signedDistance(centre.add(Vec2.baseX())),
      base - plane.signedDistance(centre.add(Vec2.baseY())),
    );
    if (!down.isZeroLength() && segment.containsAngle(Math.atan2(down.y, down.x))) {
      lowest = Math.min(lowest, plane.signedDistance(centre.add(down.unit().scale(segment.radius()))));
    }
  }
  return lowest;
}
