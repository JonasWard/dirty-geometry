/**
 * The vec2 API as the JSON a definition writes it in: `Polygon2.fromCircle2 {circle: Circle2, segments: Index} →
 * Polygon2`, with each operation's doc comment (from vec2.docs.json) where it says what the name does not. Built
 * from the schema the playground already loads, so a prompt never lists an operation that does not exist. Two
 * sizes: every operation (full), or the core ones (compact, for small models).
 */
import {
  NUMBER_TYPES,
  classes,
  isOptional,
  isRest,
  operations,
  slotType,
  types,
  type Operation,
  type Type,
} from '@dirty-geometry/vec2/schema/schema';
import { typeName } from '@dirty-geometry/vec2/schema/typing';
import docs from '@dirty-geometry/vec2/schema/vec2.docs.json';
import { DEFAULT_FAVOURITES } from '../operations';

/** The compact reference: the playground's favourites and what the examples and common shapes need. */
export const COMPACT_OPERATIONS: readonly string[] = [
  ...DEFAULT_FAVOURITES,
  'Vec2.x',
  'Vec2.y',
  'Vec2.length',
  'Vec2.dot',
  'Line2.from',
  'Line2.to',
  'Polygon2.fromCircle2',
  'Polygon2.transform',
  'Polygon2.containsPoint',
  'Polygon2.signedArea',
  'Circle2.circumference',
  'Arc2.new',
  'Arc2.fromFillet',
  'Arc2.fromThreePoints',
  'Arc2.radius',
  'Arc2.length',
  'Arc2.from',
  'Arc2.to',
  'ArcPolygon2.new',
  'ArcPolygon2.fromCircle2',
  'ArcPolygon2.fromSegments',
  'ArcPolygon2.offset',
  'ArcPolygon2.area',
  'ArcPolygon2.signedArea',
  'ArcPolyline2.new',
  'ArcPolyline2.offset',
  'Angle.fromDegrees',
  'Angle.radians',
  'Aabb2.fromMinMax',
  'Mat3.multiply',
];

const byId = new Map(operations.map((op) => [op.id, op]));
export const operationDocs: Readonly<Record<string, string>> = docs;

const param = ([name, slot]: [string, Parameters<typeof slotType>[0]]) => {
  const type = typeName(slotType(slot) as Type);
  // A rest parameter takes its items as one list under its name.
  if (isRest(slot)) return `${name}: ${type}[]`;
  return `${name}${isOptional(slot) ? '?' : ''}: ${type}`;
};

/**
 * One operation as a definition writes it: `{op, self?, args}`. `Vec2.new {x?: Coordinate, …} → Vec2` makes one;
 * `Polygon2.area {self: Polygon2} → number` is a method on `self`; a field reads `self` and takes no args.
 */
export function signature(op: Operation): string {
  const fields = [...(op.static ? [] : [`self: ${op.owner}`]), ...op.params.map(param)];
  return `${op.id} {${fields.join(', ')}}${op.value ? ' (field)' : ''} → ${typeName(op.returns as Type)}`;
}

const KNOWN = new Set<string>([...NUMBER_TYPES, ...classes, 'number', 'boolean', 'string', 'void', 'null']);

/** The named types the signatures use (and the ones those use), as `type Name = …` lines. */
function typeLines(text: string): string[] {
  const seen = new Set<string>();
  const queue = [...text.matchAll(/[A-Z][A-Za-z0-9]*/g)].map((m) => m[0]);
  const lines: string[] = [];
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name) || KNOWN.has(name) || !(name in types)) continue;
    seen.add(name);
    const body = typeName(types[name] as Type);
    lines.push(`type ${name} = ${body}`);
    queue.push(...[...body.matchAll(/[A-Z][A-Za-z0-9]*/g)].map((m) => m[0]));
  }
  return lines.sort();
}

/** One reference line: the signature, and its doc when `withDoc`. */
export const referenceLine = (op: Operation, withDoc: boolean) => {
  const doc = withDoc ? operationDocs[op.id] : undefined;
  return doc ? `${signature(op)} — ${doc}` : signature(op);
};

/**
 * Signatures grouped by class, then the named types they use. `documented`: the operations whose doc is shown
 * (each doc is a sentence, so a full reference shows them only for the core operations).
 */
export function buildReference(ids?: readonly string[], documented: ReadonlySet<string> = new Set()): string {
  const chosen = ids ? ids.map((id) => byId.get(id)).filter((op): op is Operation => !!op) : operations;
  const groups = new Map<string, Operation[]>();
  for (const op of chosen) groups.set(op.owner, [...(groups.get(op.owner) ?? []), op]);
  const out: string[] = [];
  for (const [owner, ops] of groups) {
    const sorted = [...ops].sort((a, b) => +(b.member === 'new') - +(a.member === 'new'));
    out.push(
      owner === 'helpers' ? 'helpers' : owner,
      ...sorted.map((op) => `  ${referenceLine(op, documented.has(op.id))}`),
    );
  }
  const body = out.join('\n');
  return [body, '', 'Types', ...typeLines(body).map((l) => `  ${l}`)].join('\n');
}

const CORE = new Set(COMPACT_OPERATIONS);
let full: string | undefined;
let compact: string | undefined;
export const fullReference = () => (full ??= buildReference(undefined, CORE));
export const compactReference = () => (compact ??= buildReference(COMPACT_OPERATIONS, CORE));
export const operationById = byId;
