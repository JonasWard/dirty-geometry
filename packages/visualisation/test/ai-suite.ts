/**
 * The prompts the models are scored on (`bun run ai:eval`): each with property checks on what the definition
 * evaluates to, and a hand-written reference solution that passes them (test/ai.test.ts makes sure), so a failed
 * case is the model's, never the check's.
 */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate, type Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { classNameOf } from '@dirty-geometry/vec2/recording/runtime';
import { readLiteral } from '@dirty-geometry/vec2/recording/evaluate';
import { callsItself } from '@dirty-geometry/vec2/schema/typing';
import { STARTERS } from '../src/playground/starters';

export type Tier = 'easy' | 'medium' | 'hard' | 'edit';
/** A failed check says why; a passed one returns nothing. */
export type Check = (definition: Definition, evaluation: Evaluation) => string | undefined;
export type Case = {
  id: string;
  tier: Tier;
  prompt: string;
  edit?: string;
  checks: Check[];
  reference: string;
  /** Operations a good answer builds with (any one counts): the eval's built-in usage, not a pass condition. */
  prefers?: readonly string[];
};

type Shape = { signedArea?: () => number; area?: () => number; vertices?: readonly unknown[] };

/** Every value inside an output (lists and plain objects opened up). */
const flatten = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value.flatMap(flatten)
    : value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
      ? Object.values(value).flatMap(flatten)
      : [value];
const outputs = (evaluation: Evaluation) =>
  Object.entries(evaluation.outputs).map(([name, v]) => ({ name, items: flatten(v) }));
const ofClass = (items: unknown[], classes: readonly string[]) =>
  items.filter((v) => classes.includes(classNameOf(v) ?? ''));

const REGIONS = ['Polygon2', 'ArcPolygon2', 'Circle2'];
/** An output's area: its regions' signed areas summed (holes from booleans count negative), as a size. */
const areaOf = (items: unknown[]) => {
  const regions = ofClass(items, REGIONS) as Shape[];
  if (!regions.length) return undefined;
  return Math.abs(regions.reduce((sum, r) => sum + (r.signedArea ? r.signedArea() : (r.area?.() ?? 0)), 0));
};
const near = (value: number, target: number, tolerance: number) =>
  Math.abs(value - target) <= tolerance * Math.abs(target);

/** Some output's area is within `tolerance` (a fraction) of `target`. */
export const area =
  (target: number, tolerance = 0.1): Check =>
  (_, evaluation) => {
    const areas = outputs(evaluation)
      .map((o) => areaOf(o.items))
      .filter((a): a is number => a !== undefined);
    return areas.some((a) => near(a, target, tolerance))
      ? undefined
      : `no output has area ≈ ${target.toFixed(3)} (got ${areas.map((a) => a.toFixed(3)).join(', ') || 'no regions'})`;
  };

/** Some output holds a value of one of the classes. */
export const has =
  (...classes: string[]): Check =>
  (_, evaluation) =>
    outputs(evaluation).some((o) => ofClass(o.items, classes).length) ? undefined : `no ${classes.join(' or ')} output`;

/** Some output is (or holds) one polygon with `n` vertices. */
export const vertices =
  (n: number, classes = ['Polygon2', 'ArcPolygon2']): Check =>
  (_, evaluation) => {
    const counts = outputs(evaluation).flatMap((o) =>
      (ofClass(o.items, classes) as Shape[]).map((s) => s.vertices?.length ?? 0),
    );
    return counts.includes(n) ? undefined : `no polygon with ${n} vertices (got ${counts.join(', ') || 'none'})`;
  };

/** Some output holds exactly `n` values of the classes. */
export const count =
  (n: number, ...classes: string[]): Check =>
  (_, evaluation) => {
    const counts = outputs(evaluation).map((o) => ofClass(o.items, classes).length);
    return counts.includes(n) ? undefined : `no output with ${n} × ${classes.join('/')} (got ${counts.join(', ')})`;
  };

/** Some output holds a Vec2 at (x, y). */
export const point =
  (x: number, y: number, tolerance = 0.02): Check =>
  (_, evaluation) => {
    const points = outputs(evaluation).flatMap((o) => ofClass(o.items, ['Vec2']) as { x: number; y: number }[]);
    return points.some((p) => Math.hypot(p.x - x, p.y - y) <= tolerance)
      ? undefined
      : `no output point at (${x}, ${y})`;
  };

/** Some output holds `n` points, all at distance `radius` from the origin. */
export const onCircle =
  (n: number, radius: number): Check =>
  (_, evaluation) =>
    outputs(evaluation).some((o) => {
      const points = ofClass(o.items, ['Vec2']) as { x: number; y: number }[];
      return points.length === n && points.every((p) => near(Math.hypot(p.x, p.y), radius, 0.02));
    })
      ? undefined
      : `no output with ${n} points on a circle of radius ${radius}`;

/** Some Arc2 output has this radius. */
export const arcRadius =
  (radius: number): Check =>
  (_, evaluation) =>
    outputs(evaluation).some((o) =>
      (ofClass(o.items, ['Arc2']) as { radius: () => number }[]).some((a) => near(a.radius(), radius, 0.02)),
    )
      ? undefined
      : `no arc of radius ${radius}`;

/** Some curve output reaches out to `radius` from the origin (its farthest vertex). */
export const reaches =
  (radius: number, tolerance = 0.05): Check =>
  (_, evaluation) => {
    const far = outputs(evaluation).flatMap((o) =>
      (
        ofClass(o.items, ['Polyline2', 'ArcPolyline2', 'Polygon2']) as {
          vertices: readonly { x: number; y: number }[];
        }[]
      ).map((c) => Math.max(...c.vertices.map((v) => Math.hypot(v.x, v.y)))),
    );
    return far.some((d) => near(d, radius, tolerance))
      ? undefined
      : `no curve reaching out to ${radius} (got ${far.map((d) => d.toFixed(2)).join(', ') || 'none'})`;
  };

/** At least `n` inputs, and changing them changes what the outputs draw. */
export const inputsDrive =
  (n = 1): Check =>
  (definition, evaluation) => {
    const numeric = definition.inputs.filter((i) => typeof readLiteral(i.value) === 'number');
    if (numeric.length < n) return `needs ${n} number input(s), has ${numeric.length}`;
    const changed = Object.fromEntries(numeric.map((i) => [i.name, (readLiteral(i.value) as number) * 1.25 + 1]));
    const before = JSON.stringify(evaluation.outputs, json);
    const after = JSON.stringify(evaluate(definition, { inputs: changed }).outputs, json);
    return before !== after ? undefined : 'changing the inputs changes no output';
  };
const json = (_: string, v: unknown) =>
  (v as { toJson?: () => unknown })?.toJson ? (v as { toJson: () => unknown }).toJson() : v;

/** Some function calls itself (the case asks for recursion). */
export const recursive = (): Check => (definition) =>
  definition.functions.some(callsItself) ? undefined : 'no function calls itself';

/** Runs a case's checks; the failures, or none. */
export function runChecks(c: Case, definition: Definition, evaluation: Evaluation): string[] {
  return c.checks.map((check) => check(definition, evaluation)).filter((f): f is string => !!f);
}

/** The definition an edit case starts from. */
export const startOf = (c: Case) => (c.edit ? STARTERS.find((s) => s.id === c.edit)!.build() : undefined);

const PI = Math.PI;
export const SUITE: readonly Case[] = [
  // ---- easy ----
  {
    id: 'square',
    tier: 'easy',
    prompt: 'a square with side length 2 centred at the origin',
    checks: [vertices(4), area(4)],
    reference: `
export function definition(side: Length = 2): { square: Polygon2; area: number } {
  const h = side / 2;
  const square = new Polygon2([new Vec2(-h, -h), new Vec2(h, -h), new Vec2(h, h), new Vec2(-h, h)]);
  const area = square.area();
  return { square, area };
}`,
  },
  {
    id: 'circle',
    prefers: ['Circle2.new', 'ArcPolygon2.fromCircle2'],
    tier: 'easy',
    prompt: 'a circle of radius 3 at the origin',
    checks: [has('Circle2', 'ArcPolygon2', 'Polygon2'), area(PI * 9)],
    reference: `
export function definition(radius: Length = 3): { circle: Circle2 } {
  const circle = new Circle2(new Vec2(0, 0), radius);
  return { circle };
}`,
  },
  {
    id: 'triangle',
    prefers: ['Polygon2.fromCircle2'],
    tier: 'easy',
    prompt: 'an equilateral triangle with side length 2',
    checks: [vertices(3), area(Math.sqrt(3))],
    reference: `
export function definition(side: Length = 2): { triangle: Polygon2 } {
  const triangle = new Polygon2([new Vec2(0, 0), new Vec2(side, 0), new Vec2(side / 2, side * 0.8660254)]);
  return { triangle };
}`,
  },
  {
    id: 'line-midpoint',
    tier: 'easy',
    prompt: 'a line from (0, 0) to (4, 3) and its midpoint',
    checks: [has('Line2', 'Polyline2'), point(2, 1.5)],
    reference: `
export function definition(t: Parameter = 0.5): { line: Line2; middle: Vec2 } {
  const line = new Line2(new Vec2(0, 0), new Vec2(4, 3));
  const middle = line.evaluate(t);
  return { line, middle };
}`,
  },
  {
    id: 'rectangle-inputs',
    tier: 'easy',
    prompt: 'a rectangle whose width and height are inputs, 4 and 2 by default, with its corner at the origin',
    checks: [vertices(4), area(8), inputsDrive(2)],
    reference: `
export function definition(width: Length = 4, height: Length = 2): { rectangle: Polygon2 } {
  const rectangle = new Polygon2([new Vec2(0, 0), new Vec2(width, 0), new Vec2(width, height), new Vec2(0, height)]);
  return { rectangle };
}`,
  },
  {
    id: 'hexagon',
    prefers: ['Polygon2.fromCircle2'],
    tier: 'easy',
    prompt: 'a regular hexagon with a circumradius of 2',
    checks: [vertices(6), area(((3 * Math.sqrt(3)) / 2) * 4, 0.05)],
    reference: `
export function definition(radius: Length = 2): { hexagon: Polygon2 } {
  const hexagon = Polygon2.fromCircle2(new Circle2(new Vec2(0, 0), radius), 6);
  return { hexagon };
}`,
  },
  // ---- medium ----
  {
    id: 'star',
    tier: 'medium',
    prompt: 'a 5-pointed star with outer radius 2 and inner radius 1',
    checks: [vertices(10), area(5 * 2 * 1 * Math.sin(PI / 5), 0.05)],
    reference: `
function rim(circle: Circle2, turn: Coordinate) {
  return circle.evaluate(turn * 6.2831853);
}

export function definition(outer: Length = 2, inner: Length = 1): { star: Polygon2 } {
  const a = new Circle2(new Vec2(0, 0), outer);
  const b = new Circle2(new Vec2(0, 0), inner);
  const star = new Polygon2([
    rim(a, 0), rim(b, 0.1), rim(a, 0.2), rim(b, 0.3), rim(a, 0.4),
    rim(b, 0.5), rim(a, 0.6), rim(b, 0.7), rim(a, 0.8), rim(b, 0.9),
  ]);
  return { star };
}`,
  },
  {
    id: 'union-squares',
    prefers: ['Boolean2.union'],
    tier: 'medium',
    prompt: 'the union of two 2 × 2 squares, the second one shifted by (1, 1)',
    checks: [area(7, 0.02)],
    reference: `
function square(x: Coordinate, y: Coordinate) {
  return new Polygon2([new Vec2(x, y), new Vec2(x + 2, y), new Vec2(x + 2, y + 2), new Vec2(x, y + 2)]);
}

export function definition(shift: Coordinate = 1): { union: Polygon2[] } {
  const union = Boolean2.union([square(0, 0), square(shift, shift)]).polygons;
  return { union };
}`,
  },
  {
    id: 'square-hole',
    prefers: ['Boolean2.subtract'],
    tier: 'medium',
    prompt: 'a 4 × 4 square plate with a circular hole of radius 1 in the middle',
    checks: [area(16 - PI, 0.03)],
    reference: `
export function definition(size: Length = 4, radius: Length = 1): { plate: ArcPolygon2[] } {
  const square = Polygon2.fromAabb2(Aabb2.fromPoints(new Vec2(0, 0), new Vec2(size, size)));
  const hole = ArcPolygon2.fromCircle2(new Circle2(new Vec2(size / 2, size / 2), radius));
  const plate = Boolean2.subtract([ArcPolygon2.fromPolygon(square)], hole, { arcs: { mode: 'exact' } }).regions;
  return { plate };
}`,
  },
  {
    id: 'fillet',
    prefers: ['Arc2.fromFillet'],
    tier: 'medium',
    prompt:
      'a rounded corner: a fillet of radius 1 between the line from (-3, 0) to (0, 0) and the line from (0, 0) to (0, 3)',
    checks: [arcRadius(1)],
    reference: `
export function definition(radius: Length = 1): { fillet: Arc2 } {
  const fillet = Arc2.fromFillet(new Vec2(-3, 0), new Vec2(0, 0), new Vec2(0, 3), radius);
  return { fillet };
}`,
  },
  {
    id: 'points-on-circle',
    prefers: ['Circle2.evaluate'],
    tier: 'medium',
    prompt: '8 points evenly spaced on a circle of radius 2 around the origin',
    checks: [onCircle(8, 2)],
    reference: `
import * as lib from '@dirty-geometry/fn/lib';

function around(i: Index, previous: Vec2, n: Index, radius: Length) {
  return new Circle2(new Vec2(0, 0), radius).evaluate(i * (6.2831853 / n));
}

export function definition(count: Index = 8, radius: Length = 2): { points: Vec2[] } {
  const points = lib.generate(count, around, undefined, radius);
  return { points };
}`,
  },
  {
    id: 'stadium',
    prefers: ['ArcPolygon2.new', 'ArcPolygon2.fromSegments'],
    tier: 'medium',
    prompt: 'a stadium shape: a 4 × 2 rectangle with a semicircle of radius 1 on each of its short ends',
    checks: [area(8 + PI, 0.03)],
    reference: `
export function definition(length: Length = 4, radius: Length = 1): { slot: ArcPolygon2 } {
  const h = length / 2;
  const slot = new ArcPolygon2([new Vec2(-h, -radius), new Vec2(h, -radius), new Vec2(h, radius), new Vec2(-h, radius)], [0, -radius, 0, -radius]);
  return { slot };
}`,
  },
  {
    id: 'ring',
    prefers: ['Boolean2.subtract'],
    tier: 'medium',
    prompt: 'a ring (annulus) with outer radius 3 and inner radius 2',
    checks: [area(5 * PI, 0.03)],
    reference: `
function disc(radius: Length) {
  return ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), radius));
}

export function definition(outer: Length = 3, inner: Length = 2): { ring: ArcPolygon2[] } {
  const ring = Boolean2.subtract([disc(outer)], [disc(inner)], { arcs: { mode: 'exact' } }).regions;
  return { ring };
}`,
  },
  {
    id: 'spiral',
    tier: 'medium',
    prompt: 'an Archimedean spiral of 5 turns from the origin out to radius 3, as a polyline',
    checks: [has('Polyline2', 'ArcPolyline2'), reaches(3), inputsDrive(1)],
    // Written the way models write it: consts in the helper, casts and Math.
    reference: `
import * as lib from '@dirty-geometry/fn/lib';

function spiralPoint(i: Index, previous: Vec2 | undefined, count: Index, data: (Length | Coordinate)[]): Vec2 {
  const radius = data[0] as Length;
  const t = i / (count - 1);
  const angle = t * (data[1] as Coordinate) * 2 * Math.PI;
  return new Vec2(radius * t * Math.cos(angle), radius * t * Math.sin(angle));
}

export function definition(radius: Length = 3, turns: Coordinate = 5, segments: Index = 200): { spiral: Polyline2 } {
  const spiral = new Polyline2(lib.generate(segments, spiralPoint, undefined, [radius, turns]));
  return { spiral };
}`,
  },
  // ---- hard ----
  {
    id: 'gear',
    prefers: ['Boolean2.union'],
    tier: 'hard',
    prompt: 'a gear with 12 teeth: body radius 2, each tooth 0.5 long and 0.4 wide, and a central bore of radius 0.5',
    // body + teeth outside it − bore; the teeth's inner ends overlap the disc a little.
    checks: [area(PI * 4 + 12 * 0.5 * 0.4 - PI * 0.25, 0.06)],
    reference: `
import * as lib from '@dirty-geometry/fn/lib';

function tooth(i: Index, n: Index, size: Coordinate[]) {
  return Polygon2.fromAabb2(Aabb2.fromPoints(new Vec2(0, -size[1] / 2), new Vec2(size[0] + size[2], size[1] / 2))).transform(
    Mat3.rotation(i * (6.2831853 / n)),
  );
}

// Piece 0 is the body, pieces 1…n the teeth: one list for one union.
function piece(i: Index, previous: Polygon2, count: Index, size: Coordinate[]) {
  return lib.ifElse(lib.equal(i, 0), Polygon2.fromCircle2(new Circle2(new Vec2(0, 0), size[0]), 96), tooth(i, count - 1, size));
}

export function definition(teeth: Index = 12, radius: Length = 2, length: Length = 0.5, width: Length = 0.4, bore: Length = 0.5): { gear: Polygon2[] } {
  const pieces = lib.generate(teeth + 1, piece, undefined, [radius, width, length]);
  const outline = Boolean2.union(pieces).polygons;
  const gear = Boolean2.subtract(outline, Polygon2.fromCircle2(new Circle2(new Vec2(0, 0), bore), 48)).polygons;
  return { gear };
}`,
  },
  {
    id: 'plate-holes',
    prefers: ['Boolean2.subtract'],
    tier: 'hard',
    prompt: 'a 6 × 4 plate with four holes of radius 0.4, each hole centred 1 in from both edges at a corner',
    checks: [area(24 - 4 * PI * 0.16, 0.03)],
    reference: `
function hole(x: Coordinate, y: Coordinate, r: Length) {
  return ArcPolygon2.fromCircle2(new Circle2(new Vec2(x, y), r));
}

export function definition(width: Length = 6, height: Length = 4, r: Length = 0.4, inset: Length = 1): { plate: ArcPolygon2[] } {
  const outline = ArcPolygon2.fromPolygon(Polygon2.fromAabb2(Aabb2.fromPoints(new Vec2(0, 0), new Vec2(width, height))));
  const plate = Boolean2.subtract(
    [outline],
    [hole(inset, inset, r), hole(width - inset, inset, r), hole(width - inset, height - inset, r), hole(inset, height - inset, r)],
    { arcs: { mode: 'exact' } },
  ).regions;
  return { plate };
}`,
  },
  {
    id: 'circle-grid',
    prefers: ['Circle2.new', 'ArcPolygon2.fromCircle2', 'Polygon2.fromCircle2'],
    tier: 'hard',
    prompt: 'a 3 × 3 grid of circles of radius 0.4, their centres 1.5 apart',
    checks: [count(9, 'Circle2', 'ArcPolygon2', 'Polygon2')],
    reference: `
import * as lib from '@dirty-geometry/fn/lib';

function cell(i: Index, previous: Circle2, n: Index, spacing: Coordinate[]) {
  return new Circle2(new Vec2(lib.mod(i, 3) * spacing[0], lib.floor(i / 3) * spacing[0]), spacing[1]);
}

export function definition(spacing: Length = 1.5, radius: Length = 0.4): { circles: Circle2[] } {
  const circles = lib.generate(9, cell, undefined, [spacing, radius]);
  return { circles };
}`,
  },
  {
    id: 'n-gon',
    prefers: ['Polygon2.fromCircle2'],
    tier: 'hard',
    prompt: 'a regular polygon whose number of sides is an input (7 by default), with circumradius 2',
    checks: [vertices(7), area(0.5 * 7 * 4 * Math.sin((2 * PI) / 7), 0.03), inputsDrive(1)],
    reference: `
import * as lib from '@dirty-geometry/fn/lib';

function corner(i: Index, previous: Vec2, n: Index, radius: Length) {
  return new Circle2(new Vec2(0, 0), radius).evaluate(i * (6.2831853 / n));
}

export function definition(sides: Index = 7, radius: Length = 2): { polygon: Polygon2 } {
  const polygon = new Polygon2(lib.generate(sides, corner, undefined, radius));
  return { polygon };
}`,
  },
  {
    id: 'l-tree',
    tier: 'hard',
    prompt: 'an L-shaped tree made with recursion: each L carries two smaller, rotated copies of itself, 3 levels deep',
    checks: [has('Polygon2', 'ArcPolygon2'), recursive(), inputsDrive(1)],
    prefers: ['Polygon2.transform'],
    reference: `
import * as lib from '@dirty-geometry/fn/lib';

function ell() {
  return new Polygon2([new Vec2(-0.1, 0), new Vec2(0.1, 0), new Vec2(0.1, 0.9), new Vec2(0.5, 0.9), new Vec2(0.5, 1.1), new Vec2(-0.1, 1.1)]);
}

function child(x: Coordinate, y: Coordinate, angle: Radians) {
  return Mat3.translation(x, y).multiply(Mat3.rotation(angle).multiply(Mat3.scale(0.6)));
}

function limb(level: Index): Polygon2 {
  return lib.ifElse(
    lib.smallerThan(level, 1),
    ell(),
    Boolean2.union([ell(), limb(level - 1).transform(child(0, 1, 0.5)), limb(level - 1).transform(child(0.45, 1, -0.5))]).polygons[0],
  );
}

export function definition(depth: Index = 3): { tree: Polygon2 } {
  const tree = limb(depth);
  return { tree };
}`,
  },
  // ---- edits of a starter ----
  {
    id: 'edit-star-7',
    tier: 'edit',
    edit: 'star',
    prompt: 'make it a 7-pointed star',
    checks: [vertices(14)],
    reference: `
function rim(circle: Circle2, turn: Coordinate) {
  return circle.evaluate(turn * 6.2832);
}

export function definition(radius: Length = 2, inset: Length = 1.1): { star: Polygon2; area: number } {
  const outer = new Circle2(new Vec2(0, 0), radius);
  const inner = new Circle2(new Vec2(0, 0), radius - inset);
  const star = new Polygon2([
    rim(outer, 0), rim(inner, 0.0714286), rim(outer, 0.1428571), rim(inner, 0.2142857), rim(outer, 0.2857143),
    rim(inner, 0.3571429), rim(outer, 0.4285714), rim(inner, 0.5), rim(outer, 0.5714286), rim(inner, 0.6428571),
    rim(outer, 0.7142857), rim(inner, 0.7857143), rim(outer, 0.8571429), rim(inner, 0.9285714),
  ]);
  const area = star.area();
  return { star, area };
}`,
  },
  {
    id: 'edit-squares-bigger',
    tier: 'edit',
    edit: 'squares',
    prompt: 'make the second square (b) twice as large, keeping its corner where it is',
    // a: 3 × 3 at the origin; b: 6 × 6 from (1.5, 1.5); they overlap in 1.5 × 1.5.
    checks: [area(9 + 36 - 2.25, 0.02)],
    reference: `
function square(x: Coordinate, y: Coordinate, size: Length) {
  return new Polygon2([new Vec2(x, y), new Vec2(x + size, y), new Vec2(x + size, y + size), new Vec2(x, y + size)]);
}

export function definition(size: Length = 3): { a: Polygon2; b: Polygon2; union: Polygon2[] } {
  const a = square(0, 0, size);
  const b = square(1.5, 1.5, 6);
  const union = Boolean2.union([a, b]).polygons;
  return { a, b, union };
}`,
  },
  {
    id: 'edit-line-point',
    tier: 'edit',
    edit: 'line',
    prompt: 'also return a second point on the line at t = 0.75',
    checks: [point(1.75, 1.25), point(-0.75, -0.25)],
    reference: `
export function definition(t: Parameter = 0.25): { line: Line2; point: Vec2; second: Vec2 } {
  const line = new Line2(new Vec2(-2, -1), new Vec2(3, 2));
  const point = line.evaluate(t);
  const second = line.evaluate(0.75);
  return { line, point, second };
}`,
  },
];
