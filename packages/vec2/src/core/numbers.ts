/**
 * Semantic number types: what a stored number means. They are plain `number`s at runtime; the schema generator
 * reads the names, and each one becomes a densing numeric definition with the ranges listed in {@link NUMBERS}.
 */

/** A position or signed distance in model units. */
export type Coordinate = number;
/** A non-negative distance: a radius, a cell size, a length along a curve. */
export type Length = number;
/** An angle in radians. */
export type Radians = number;
/** A position along a curve, 0 at its start and 1 at its end. */
export type Parameter = number;
/** A signed whole number: a grid cell coordinate, a hash. */
export type Integer = number;
/** A non-negative whole number: an index or a count. */
export type Index = number;
/** A small signed number used as a tolerance. */
export type Tolerance = number;

/** The spans a Coordinate (`±span`) or a Length (`0..span`) can have, and the precisions crossed with them. */
const SPANS = [1, 10, 100, 1000, 10000];
const PRECISIONS = [1, 0.1, 0.01, 0.001, 0.0001];
/** Every span crossed with every precision; whole numbers (precision 1) are written without `@`. */
const grid = (signed: boolean): string[] =>
  SPANS.flatMap((span) =>
    PRECISIONS.map((precision) => `${signed ? `±${span}` : `0..${span}`}${precision === 1 ? '' : `@${precision}`}`),
  );
/** `ranges` with `first` moved to the front: the first range is the default. */
const startingWith = (first: string, ranges: string[]) => [first, ...ranges.filter((range) => range !== first)];

/**
 * The ranges each number type can be packed with; the first is the default. A name is its own definition:
 * `±max@precision`, `min..max@precision`, or without `@precision` for whole numbers. A refinement `extends` another
 * type, clamps its ranges to `min` / `max` and may add `ranges` of its own.
 *
 * Coordinates are always signed and Lengths never negative: each crosses the spans 1 … 10000 with the precisions
 * 1 … 0.0001 (25 ranges).
 */
export const NUMBERS = {
  Coordinate: startingWith('±100@0.01', grid(true)),
  Length: startingWith('0..100@0.01', grid(false)),
  Radians: ['±7@0.001', '±7@0.01', '±7@0.0001'],
  Parameter: ['0..1@0.001', '0..1@0.01', '0..1@0.0001'],
  Integer: ['±1024', '±32768', '±33554432'],
  Index: { extends: 'Integer', min: 0, ranges: ['0..255'] },
  Tolerance: ['±1@0.000001', '±0.01@0.00000001'],
};
