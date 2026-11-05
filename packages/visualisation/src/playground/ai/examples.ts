/**
 * Worked examples for the prompt, written to show the library's operations doing the work: regions from
 * `fromCircle2`, holes with `Boolean2.subtract`, copies with `generate` and a `Mat3` each. Kept apart from the eval
 * suite's cases. Written as code (it reads better) and sent as JSON; test/ai.test.ts checks each one evaluates.
 */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { parseDefinition } from '../model/parse';
import { STARTERS } from '../starters';

const FLANGE = `
import * as lib from '@dirty-geometry/fn/lib';

function boltHole(i: Index, previous: ArcPolygon2, count: Index, size: Coordinate[]) {
  return ArcPolygon2.fromCircle2(new Circle2(new Circle2(new Vec2(0, 0), size[0]).evaluate(i * (6.2832 / count)), size[1]));
}

export function definition(
  radius: Length = 3,
  bore: Length = 1,
  bolts: Index = 6,
  pitch: Length = 2.2,
  bolt: Length = 0.25,
): { flange: ArcPolygon2[] } {
  const disc = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), radius));
  const holes = lib.generate(bolts, boltHole, undefined, [pitch, bolt]);
  const center = ArcPolygon2.fromCircle2(new Circle2(new Vec2(0, 0), bore));
  const bored = Boolean2.subtract([disc], center, { arcs: { mode: 'exact' } }).regions;
  const flange = Boolean2.subtract(bored, holes, { arcs: { mode: 'exact' } }).regions;
  return { flange };
}`;

const PATTERN = `
import * as lib from '@dirty-geometry/fn/lib';

function tile(i: Index, previous: Polygon2, count: Index, size: Coordinate[]) {
  return Polygon2.fromCircle2(new Circle2(new Vec2(0, 0), size[0]), 5).transform(Mat3.translation(i * size[1], 0));
}

export function definition(count: Index = 4, radius: Length = 0.8, spacing: Length = 2): { tiles: Polygon2[] } {
  const tiles = lib.generate(count, tile, undefined, [radius, spacing]);
  return { tiles };
}`;

const CROSS = `
export function definition(length: Length = 4, width: Length = 1): { cross: Polygon2[]; area: number } {
  const bar = Polygon2.fromAabb2(Aabb2.fromPoints(new Vec2(-length / 2, -width / 2), new Vec2(length / 2, width / 2)));
  const upright = bar.transform(Mat3.rotation(1.5708));
  const cross = Boolean2.union([bar, upright]).polygons;
  const area = cross[0].area();
  return { cross, area };
}`;

const OWN: Record<string, { label: string; code: string }> = {
  flange: { label: 'Flange: a disc with a bore and generated bolt holes', code: FLANGE },
  pattern: { label: 'A row of pentagons: one shape, copied with a translation each', code: PATTERN },
  cross: { label: 'A cross: a bar and its rotated copy, merged', code: CROSS },
};

/** Starters that build with operations (not vertex by vertex), also usable as examples. */
const FROM_STARTERS = [
  'slot',
  'lens',
  'gear',
  'mounting-plate',
  'half-ring',
  'fillet',
  'wave',
  'wobbly-ring',
  'three-points',
];

export type Example = { id: string; label: string; build: () => Definition };
export const EXAMPLES: readonly Example[] = [
  ...Object.entries(OWN).map(([id, { label, code }]) => ({ id, label, build: () => parseDefinition(code) })),
  ...STARTERS.filter((s) => FROM_STARTERS.includes(s.id)),
];
