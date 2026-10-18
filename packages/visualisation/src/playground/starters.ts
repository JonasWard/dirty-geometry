/** Starting definitions for the playground: the recorded plate, and a few written as code. */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { fromV3 } from '@dirty-geometry/vec2/recording/migrate';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';
import { parseDefinition } from './model/parse';

const LINE = `
export function definition(t: Parameter = 0.25) {
  const line = new Line2(new Vec2(-2, -1), new Vec2(3, 2));
  const point = line.evaluate(t);
  return { line, point };
}`;

const SQUARES = `
function square(x: Coordinate, y: Coordinate, size: Length) {
  return new Polygon2([new Vec2(x, y), new Vec2(x + size, y), new Vec2(x + size, y + size), new Vec2(x, y + size)]);
}

export function definition(size: Length = 3) {
  const a = square(0, 0, size);
  const b = square(1.5, 1.5, 3);
  const union = Boolean2.union([a, b]).polygons;
  return { a, b, union };
}`;

const STAR = `
function rim(circle: Circle2, turn: Coordinate) {
  return circle.evaluate(turn * 6.2832);
}

export function definition(radius: Length = 2, inset: Length = 1.1) {
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

export const STARTERS: readonly { id: string; label: string; build: () => Definition }[] = [
  { id: 'plate', label: 'Plate with a hole', build: () => fromV3(recordPlate()) },
  { id: 'star', label: 'Star from a function', build: () => parseDefinition(STAR) },
  { id: 'line', label: 'Line and a point on it', build: () => parseDefinition(LINE) },
  { id: 'squares', label: 'Union of two squares', build: () => parseDefinition(SQUARES) },
];
