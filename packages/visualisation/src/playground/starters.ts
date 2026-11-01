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
];
