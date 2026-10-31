import { describe, expect, test } from 'bun:test';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Epsilon } from '../../src/core/epsilon';
import { Vec2 } from '../../src/core/vec2';
import { ArcPolyline2 } from '../../src/geometry/curves/arc-polyline2';
import { Arc2 } from '../../src/geometry/primitives/arc2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Contains2 } from '../../src/operations/contains2';
import { Overlap2 } from '../../src/operations/overlap2';

const V = (x: number, y: number) => new Vec2(x, y);
/** Arc from (−1, 0) to (1, 0) with its apex at (0, s). */
const bulge = (s: number) => new Arc2(V(-1, 0), V(1, 0), s);
const disc = (x: number, y: number, r: number) => ArcPolygon2.fromCircle2(new Circle2(V(x, y), r));
const uShape = new Polygon2([V(0, 0), V(3, 0), V(3, 3), V(2, 3), V(2, 1), V(1, 1), V(1, 3), V(0, 3)]);
/** The square [0, 2]² with its right side dented inwards to x = 1.5. */
const dented = new ArcPolygon2([V(0, 0), V(2, 0), V(2, 2), V(0, 2)], [0, 0.5, 0, 0]);

describe('Contains2 with arcs', () => {
  test('an arc in a circle: its farthest point decides, not its ends', () => {
    const circle = new Circle2(V(0, 0), 2);
    expect(Contains2.contains(circle, bulge(1))).toBe(true);
    expect(Contains2.contains(circle, bulge(2.5))).toBe(false); // the major arc's top is at y = 2.5
  });

  test('an arc in a half-plane and a box', () => {
    const below = new InfiniteLine2(V(0, 1), V(1, 0)); // y <= 1
    expect(Contains2.contains(below, bulge(0.9))).toBe(true);
    expect(Contains2.contains(below, bulge(1.2))).toBe(false);
    const box = Aabb2.fromPoints(V(-2, -2), V(2, 2));
    expect(Contains2.contains(box, bulge(1))).toBe(true);
    expect(Contains2.contains(box, bulge(2.5))).toBe(false);
  });

  test('an arc in a non-convex polygon', () => {
    expect(Contains2.contains(uShape, new Arc2(V(0.5, 2), V(2.5, 2), 0.5))).toBe(false); // over the notch
    expect(Contains2.contains(uShape, new Arc2(V(0.5, 0.5), V(2.5, 0.5), -0.3))).toBe(true);
  });

  test('guests inside an ArcPolygon2', () => {
    const container = disc(0, 0, 2);
    expect(Contains2.contains(container, new Line2(V(-1, 0), V(1, 0)))).toBe(true);
    expect(Contains2.contains(container, new Line2(V(-1, 0), V(3, 0)))).toBe(false);
    expect(Contains2.contains(container, new Circle2(V(0.5, 0), 1))).toBe(true);
    expect(Contains2.contains(container, new Circle2(V(0.5, 0), 1.6))).toBe(false);
    expect(Contains2.contains(dented, new Line2(V(1.4, 0.2), V(1.4, 1.8)))).toBe(true);
    expect(Contains2.contains(dented, new Line2(V(1.6, 0.2), V(1.6, 1.8)))).toBe(false); // crosses the dent
  });

  test('chains and regions as guests', () => {
    const path = new ArcPolyline2([V(0.5, 0.5), V(2.5, 0.5), V(2.5, 2.5)], [-0.2, 0]);
    expect(Contains2.contains(uShape, path)).toBe(true);
    expect(Contains2.contains(new Circle2(V(0, 0), 3), disc(0.5, 0, 2))).toBe(true);
    expect(Contains2.contains(new Circle2(V(0, 0), 3), disc(1.5, 0, 2))).toBe(false);
  });

  test('touching the boundary counts only with preferIn', () => {
    const container = disc(0, 0, 1);
    const chord = new Line2(V(-1, 0), V(1, 0));
    expect(Contains2.contains(container, chord, Epsilon.preferIn)).toBe(true);
    expect(Contains2.contains(container, chord, Epsilon.preferOut)).toBe(false);
  });
});

describe('Overlap2 with arcs', () => {
  const lowerHalf = bulge(-1); // the lower half of the unit circle

  test('an arc and a segment', () => {
    expect(Overlap2.overlaps(lowerHalf, new Line2(V(0, -5), V(0, 5)))).toBe(true);
    expect(Overlap2.overlaps(lowerHalf, new Line2(V(-0.5, 0.5), V(0.5, 0.5)))).toBe(false);
  });

  test('an arc inside a filled shape overlaps it', () => {
    expect(Overlap2.overlaps(lowerHalf, new Circle2(V(0, 0), 3))).toBe(true);
    expect(Overlap2.overlaps(new Polygon2([V(-3, -3), V(3, -3), V(3, 3), V(-3, 3)]), lowerHalf)).toBe(true);
    expect(Overlap2.overlaps(lowerHalf, new Circle2(V(10, 0), 1))).toBe(false);
  });

  test('ArcPolygon2 against points and other regions', () => {
    const bulged = new ArcPolygon2([V(0, 0), V(2, 0), V(2, 2), V(0, 2)], [0, -0.5, 0, 0]);
    expect(Overlap2.overlaps(bulged, V(2.3, 1))).toBe(true);
    expect(Overlap2.overlaps(bulged, V(2.6, 1))).toBe(false);
    expect(Overlap2.overlaps(disc(0, 0, 1), disc(3, 0, 1))).toBe(false);
    expect(Overlap2.overlaps(disc(0, 0, 1), disc(1.5, 0, 1))).toBe(true);
    expect(Overlap2.overlaps(disc(0, 0, 3), disc(0.5, 0, 1))).toBe(true); // nested
  });

  test('a half-plane reaches an arc at its lowest point', () => {
    expect(Overlap2.overlaps(new InfiniteLine2(V(0, -0.9), V(1, 0)), lowerHalf)).toBe(true);
    expect(Overlap2.overlaps(new InfiniteLine2(V(0, -1.1), V(1, 0)), lowerHalf)).toBe(false);
  });

  test('touching discs overlap only with preferIn', () => {
    expect(Overlap2.overlaps(disc(0, 0, 1), disc(2, 0, 1), Epsilon.preferIn)).toBe(true);
    expect(Overlap2.overlaps(disc(0, 0, 1), disc(2, 0, 1), Epsilon.preferOut)).toBe(false);
    expect(Overlap2.overlaps(disc(0, 0, 1), disc(1.5, 0, 1), Epsilon.preferOut)).toBe(true);
  });
});
