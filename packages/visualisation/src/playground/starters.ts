/**
 * Starting definitions for the playground: the recorded plate, and examples written as code (each checked against
 * worked values in test/playground.test.ts).
 */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { fromV3 } from '@dirty-geometry/vec2/recording/migrate';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';
import { parseDefinition } from './model/parse';

const LINE = `
export function definition(t: Parameter = 0.25): { line: Line2; point: Vec2 } {
  const line = new Line2(new Vec2(-2, -1), new Vec2(3, 2));
  const point = line.evaluate(t);
  return { line, point };
}`;

const SQUARES = `
function square(x: Coordinate, y: Coordinate, size: Length) {
  return new Polygon2([new Vec2(x, y), new Vec2(x + size, y), new Vec2(x + size, y + size), new Vec2(x, y + size)]);
}

export function definition(size: Length = 3): { a: Polygon2; b: Polygon2; union: Polygon2[] } {
  const a = square(0, 0, size);
  const b = square(1.5, 1.5, 3);
  const union = Boolean2.union([a, b]).polygons;
  return { a, b, union };
}`;

const STAR = `
function rim(circle: Circle2, turn: Coordinate) {
  return circle.evaluate(turn * 6.2832);
}

export function definition(radius: Length = 2, inset: Length = 1.1): { star: Polygon2; area: number } {
  const outer = new Circle2(new Vec2(0, 0), radius);
  const inner = new Circle2(new Vec2(0, 0), radius - inset);
  const star = new Polygon2([
    rim(outer, 0),
    rim(inner, 0.1),
    rim(outer, 0.2),
    rim(inner, 0.3),
    rim(outer, 0.4),
    rim(inner, 0.5),
    rim(outer, 0.6),
    rim(inner, 0.7),
    rim(outer, 0.8),
    rim(inner, 0.9),
  ]);
  const area = star.area();
  return { star, area };
}`;

const FILLET = `
export function definition(radius: Length = 1): { legs: Polyline2; fillet: Arc2; length: number } {
  const a = new Vec2(-3, 0);
  const corner = new Vec2(0, 0);
  const b = new Vec2(0, 3);
  const legs = new Polyline2([a, corner, b]);
  const fillet = Arc2.fromFillet(a, corner, b, radius);
  const length = fillet.length();
  return { legs, fillet, length };
}`;

const THREE_POINTS = `
export function definition(height: Coordinate = 1): { arc: Arc2; points: Vec2[]; radius: number } {
  const from = new Vec2(-2, 0);
  const through = new Vec2(0, height);
  const to = new Vec2(2, 0);
  const arc = Arc2.fromThreePoints(from, through, to);
  const points = [from, through, to];
  const radius = arc.radius();
  return { arc, points, radius };
}`;

const SLOT = `
export function definition(gap: Length = 0.5): { slot: ArcPolygon2; offset: ArcPolygon2; area: number } {
  const slot = ArcPolygon2.new([new Vec2(-2, -1), new Vec2(2, -1), new Vec2(2, 1), new Vec2(-2, 1)], [0, -1, 0, -1]);
  const offset = slot.offset(-gap);
  const area = slot.area();
  return { slot, offset, area };
}`;

const LENS = `
function disc(x: Coordinate, radius: Length) {
  return ArcPolygon2.fromCircle2(new Circle2(new Vec2(x, 0), radius));
}

export function definition(radius: Length = 2): { lens: ArcPolygon2[]; both: ArcPolygon2[]; area: number } {
  const a = disc(0, radius);
  const b = disc(radius, radius);
  const lens = Boolean2.intersect([a], [b], { arcs: { mode: 'exact' } }).regions;
  const both = Boolean2.union([a, b], { arcs: { mode: 'exact' } }).regions;
  const area = lens[0].area();
  return { lens, both, area };
}`;

const WAVE = `
export function definition(distance: Coordinate = 0.4): { wave: ArcPolyline2; offset: ArcPolyline2; length: number } {
  const wave = ArcPolyline2.new([new Vec2(-3, 0), new Vec2(-1, 0), new Vec2(1, 0), new Vec2(3, 0)], [1, -1, 1]);
  const offset = wave.offset(distance);
  const length = wave.length();
  return { wave, offset, length };
}`;

// ---- more involved: functions, transforms and exact booleans together ----

const MOUNTING_PLATE = `
function corner(a: Vec2, b: Vec2, c: Vec2, radius: Length) {
  return Arc2.fromFillet(a, b, c, radius);
}

function hole(x: Coordinate, y: Coordinate, radius: Length) {
  return ArcPolygon2.fromCircle2(new Circle2(new Vec2(x, y), radius));
}

export function definition(
  width: Length = 6,
  height: Length = 4,
  radius: Length = 1,
  inset: Length = 1,
  bolt: Length = 0.3,
  wall: Length = 0.25,
): { plate: ArcPolygon2[]; inner: ArcPolygon2; area: number; ring: number } {
  const p0 = new Vec2(0, 0);
  const p1 = new Vec2(width, 0);
  const p2 = new Vec2(width, height);
  const p3 = new Vec2(0, height);
  const c0 = corner(p3, p0, p1, radius);
  const c1 = corner(p0, p1, p2, radius);
  const c2 = corner(p1, p2, p3, radius);
  const c3 = corner(p2, p3, p0, radius);
  const outline = ArcPolygon2.fromSegments([
    c0,
    new Line2(c0.to, c1.from),
    c1,
    new Line2(c1.to, c2.from),
    c2,
    new Line2(c2.to, c3.from),
    c3,
    new Line2(c3.to, c0.from),
  ]);
  const plate = Boolean2.subtract(
    [outline],
    [
      hole(inset, inset, bolt),
      hole(width - inset, inset, bolt),
      hole(width - inset, height - inset, bolt),
      hole(inset, height - inset, bolt),
    ],
    { arcs: { mode: 'exact' } },
  ).regions;
  const inner = outline.offset(wall);
  const area =
    plate[0].signedArea() + plate[1].signedArea() + plate[2].signedArea() + plate[3].signedArea() + plate[4].signedArea();
  const ring = outline.area() - inner.area();
  return { plate, inner, area, ring };
}`;

const HALF_RING = `
function disc(radius: Length) {
  return ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), radius));
}

export function definition(outer: Length = 3, inner: Length = 2): { half: ArcPolygon2[]; area: number } {
  const ring = Boolean2.subtract([disc(outer)], [disc(inner)], { arcs: { mode: 'exact' } }).regions;
  const half = Boolean2.subtract(ring, new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)), {
    arcs: { mode: 'exact' },
  }).regions;
  const area = half[0].area();
  return { half, area };
}`;

const GEAR = `
function tooth(width: Length, reach: Length, degrees: Coordinate) {
  return Polygon2.fromAabb2(Aabb2.fromPoints(new Vec2(0, -width / 2), new Vec2(reach, width / 2))).transform(
    Mat3.rotation(Angle.fromDegrees(degrees).radians()),
  );
}

export function definition(
  radius: Length = 2,
  height: Length = 0.6,
  width: Length = 0.5,
  bore: Length = 0.6,
): { gear: ArcPolygon2[]; area: number } {
  const reach = radius + height;
  const disc = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), radius));
  const body = Boolean2.union(
    [
      disc,
      tooth(width, reach, 0),
      tooth(width, reach, 45),
      tooth(width, reach, 90),
      tooth(width, reach, 135),
      tooth(width, reach, 180),
      tooth(width, reach, 225),
      tooth(width, reach, 270),
      tooth(width, reach, 315),
    ],
    { arcs: { mode: 'exact' } },
  ).regions;
  const gear = Boolean2.subtract(body, ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), bore)), {
    arcs: { mode: 'exact' },
  }).regions;
  const area = gear[0].signedArea() + gear[1].signedArea();
  return { gear, area };
}`;

const WOBBLY_RING = `
import * as lib from '@dirty-geometry/fn/lib';

function onRing(i: Index, previous: Vec2, n: Index, shape: Coordinate[]) {
  return new Circle2(new Vec2(0, 0), shape[0] + shape[1] * (lib.smooth(shape[2], i * 0.4) - 0.5)).evaluate(
    i * (6.283 / n),
  );
}

function leftOf(point: Vec2, i: Index, cut: Coordinate) {
  return lib.smallerThan(point.x, cut);
}

function byHeight(point: Vec2) {
  return point.y;
}

export function definition(
  points: Index = 48,
  radius: Length = 2,
  wobble: Length = 1.2,
  seed: Integer = 7,
  cut: Coordinate = 1,
): { outline: Polygon2; kept: Vec2[]; count: Index } {
  const ring = lib.generate(points, onRing, undefined, [radius, wobble, seed]);
  const outline = new Polygon2(ring);
  const kept = lib.sort(lib.filter(ring, leftOf, cut), byHeight);
  const count = lib.length(kept);
  return { outline, kept, count };
}`;

/** The code of the starters written as code (all but the recorded plate), by id: examples for prompts. */
export const STARTER_CODE: Readonly<Record<string, string>> = {
  star: STAR.trim(),
  line: LINE.trim(),
  squares: SQUARES.trim(),
  fillet: FILLET.trim(),
  'three-points': THREE_POINTS.trim(),
  slot: SLOT.trim(),
  lens: LENS.trim(),
  wave: WAVE.trim(),
  'mounting-plate': MOUNTING_PLATE.trim(),
  'half-ring': HALF_RING.trim(),
  gear: GEAR.trim(),
  'wobbly-ring': WOBBLY_RING.trim(),
};

export const STARTERS: readonly { id: string; label: string; build: () => Definition }[] = [
  { id: 'plate', label: 'Plate with a hole', build: () => fromV3(recordPlate()) },
  { id: 'star', label: 'Star from a function', build: () => parseDefinition(STAR) },
  { id: 'line', label: 'Line and a point on it', build: () => parseDefinition(LINE) },
  { id: 'squares', label: 'Union of two squares', build: () => parseDefinition(SQUARES) },
  { id: 'fillet', label: 'Rounded corner (fillet)', build: () => parseDefinition(FILLET) },
  { id: 'three-points', label: 'Arc through three points', build: () => parseDefinition(THREE_POINTS) },
  { id: 'slot', label: 'Slot with rounded ends and its offset', build: () => parseDefinition(SLOT) },
  { id: 'lens', label: 'Exact lens and union of two discs', build: () => parseDefinition(LENS) },
  { id: 'wave', label: 'Wavy arc path and its offset', build: () => parseDefinition(WAVE) },
  {
    id: 'mounting-plate',
    label: 'Mounting plate: fillets, bolt holes, wall',
    build: () => parseDefinition(MOUNTING_PLATE),
  },
  { id: 'half-ring', label: 'Half ring: exact annulus cut by a line', build: () => parseDefinition(HALF_RING) },
  { id: 'gear', label: 'Gear: eight rotated teeth and a bore', build: () => parseDefinition(GEAR) },
  {
    id: 'wobbly-ring',
    label: 'Wobbly ring: generated points, smooth noise, filter and sort',
    build: () => parseDefinition(WOBBLY_RING),
  },
];
