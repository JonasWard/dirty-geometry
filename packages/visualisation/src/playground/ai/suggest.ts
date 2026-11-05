/**
 * The operations that fit a request, shown to the model first with what they do, so it reaches for
 * `Polygon2.fromCircle2` instead of computing a hexagon's corners with sin and cos. Ranked by a table of what
 * people ask for (hole → Boolean2.subtract), then by the request's words in operation names and docs.
 */
import { operations, type Operation } from '@dirty-geometry/vec2/schema/schema';
import { operationDocs } from './reference';

/** Words of a request → the operations that do it. Keys are matched without a trailing s. */
export const INTENTS: Readonly<Record<string, readonly string[]>> = {
  hole: ['Boolean2.subtract', 'ArcPolygon2.fromCircle2'],
  cut: ['Boolean2.subtract'],
  subtract: ['Boolean2.subtract'],
  minus: ['Boolean2.subtract'],
  union: ['Boolean2.union'],
  merge: ['Boolean2.union'],
  combine: ['Boolean2.union'],
  join: ['Boolean2.union'],
  intersect: ['Boolean2.intersect'],
  intersection: ['Boolean2.intersect', 'Intersection2.lines'],
  overlap: ['Boolean2.intersect'],
  rounded: ['Arc2.fromFillet', 'ArcPolygon2.fromSegments'],
  fillet: ['Arc2.fromFillet', 'ArcPolygon2.fromSegments'],
  corner: ['Arc2.fromFillet'],
  regular: ['Polygon2.fromCircle2'],
  hexagon: ['Polygon2.fromCircle2'],
  pentagon: ['Polygon2.fromCircle2'],
  octagon: ['Polygon2.fromCircle2'],
  triangle: ['Polygon2.fromCircle2'],
  gon: ['Polygon2.fromCircle2'],
  side: ['Polygon2.fromCircle2'],
  circle: ['Circle2.new', 'ArcPolygon2.fromCircle2', 'Circle2.evaluate'],
  disc: ['ArcPolygon2.fromCircle2'],
  ring: ['Boolean2.subtract', 'ArcPolygon2.fromCircle2'],
  annulus: ['Boolean2.subtract', 'ArcPolygon2.fromCircle2'],
  washer: ['Boolean2.subtract', 'ArcPolygon2.fromCircle2'],
  offset: ['ArcPolygon2.offset', 'ArcPolyline2.offset'],
  wall: ['ArcPolygon2.offset'],
  inset: ['ArcPolygon2.offset'],
  outline: ['ArcPolygon2.offset'],
  thick: ['ArcPolygon2.offset'],
  rotate: ['Mat3.rotation', 'Polygon2.transform'],
  rotated: ['Mat3.rotation', 'Polygon2.transform'],
  copie: ['Mat3.rotation', 'Polygon2.transform'],
  copy: ['Mat3.translation', 'Polygon2.transform'],
  pattern: ['Mat3.rotation', 'Mat3.translation', 'Polygon2.transform'],
  move: ['Mat3.translation', 'Polygon2.transform'],
  shift: ['Mat3.translation', 'Polygon2.transform'],
  scale: ['Mat3.scale', 'Polygon2.transform'],
  mirror: ['Mat3.scale', 'Polygon2.transform'],
  gear: ['Polygon2.fromCircle2', 'Boolean2.union', 'Mat3.rotation', 'Polygon2.transform'],
  tree: ['Polygon2.transform', 'Mat3.rotation', 'Mat3.translation', 'Mat3.scale', 'Boolean2.union'],
  branch: ['Polygon2.transform', 'Mat3.rotation', 'Mat3.translation', 'Mat3.scale'],
  fractal: ['Polygon2.transform', 'Mat3.scale', 'Mat3.rotation'],
  recursion: ['Polygon2.transform', 'Mat3.multiply'],
  recursive: ['Polygon2.transform', 'Mat3.multiply'],
  teeth: ['Boolean2.union', 'Mat3.rotation', 'Polygon2.transform'],
  tooth: ['Boolean2.union', 'Mat3.rotation', 'Polygon2.transform'],
  star: ['Circle2.evaluate', 'Polygon2.new'],
  rectangle: ['Polygon2.fromAabb2', 'Aabb2.fromPoints'],
  square: ['Polygon2.fromAabb2', 'Aabb2.fromPoints'],
  box: ['Polygon2.fromAabb2', 'Aabb2.fromPoints'],
  plate: ['Polygon2.fromAabb2', 'Boolean2.subtract'],
  slot: ['ArcPolygon2.new', 'ArcPolygon2.offset'],
  stadium: ['ArcPolygon2.new'],
  capsule: ['ArcPolygon2.new'],
  arc: ['Arc2.fromThreePoints', 'Arc2.new', 'ArcPolyline2.new'],
  spiral: ['Polyline2.new', 'ArcPolyline2.new', 'Circle2.evaluate'],
  path: ['Polyline2.new', 'ArcPolyline2.new'],
  wave: ['ArcPolyline2.new'],
  curve: ['ArcPolyline2.new', 'Polyline2.new'],
  line: ['Line2.new', 'Line2.evaluate'],
  midpoint: ['Line2.evaluate', 'Vec2.center'],
  middle: ['Line2.evaluate', 'Vec2.center'],
  centre: ['Vec2.center'],
  center: ['Vec2.center'],
  hull: ['helpers.convexHullLoop'],
  triangulate: ['ConstrainedDelaunay.triangulate'],
  mesh: ['ConstrainedDelaunay.triangulate'],
  simplify: ['DouglasPeucker.simplify'],
  grid: ['Mat3.translation', 'Polygon2.transform'],
  area: ['Polygon2.area', 'ArcPolygon2.area'],
  length: ['Polyline2.length', 'Line2.length'],
  perimeter: ['Polyline2.length'],
};

const WORD = /[a-z]+/g;
const stem = (word: string) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
/** `fromCircle2` → from, circle; `ArcPolygon2` → arc, polygon. */
const nameWords = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(WORD) ?? [];
const COMMON = new Set([
  'a',
  'an',
  'the',
  'of',
  'with',
  'and',
  'in',
  'on',
  'to',
  'at',
  'by',
  'for',
  'from',
  'it',
  'is',
  'make',
  'new',
]);

/** The operations that fit `prompt`, best first: at most `count`, none that merely share a common word. */
export function suggestOperations(prompt: string, count = 12): Operation[] {
  const words = [...new Set((prompt.toLowerCase().match(WORD) ?? []).map(stem))].filter(
    (w) => w.length > 1 && !COMMON.has(w),
  );
  const scores = new Map<string, number>();
  const add = (id: string, points: number) => scores.set(id, (scores.get(id) ?? 0) + points);
  for (const word of words) for (const id of INTENTS[word] ?? []) add(id, 6);
  for (const op of operations) {
    const own = new Set(nameWords(op.id).map(stem));
    const doc = new Set((operationDocs[op.id]?.toLowerCase().match(WORD) ?? []).map(stem));
    for (const word of words) {
      if (own.has(word)) add(op.id, 2);
      else if (doc.has(word)) add(op.id, 1);
    }
  }
  const byId = new Map(operations.map((op) => [op.id, op]));
  return [...scores]
    .filter(([id, score]) => score >= 2 && byId.has(id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([id]) => byId.get(id)!);
}
