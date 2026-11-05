/**
 * The vec2 API as short TypeScript-like signatures, built from the schema the playground already loads, so a
 * prompt never lists an operation that does not exist (or misses a new one). Two sizes: every operation (full), or
 * the core ones (compact, for small models). The `lib` functions are described in the prompt itself.
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

const param = ([name, slot]: [string, Parameters<typeof slotType>[0]]) => {
  const type = typeName(slotType(slot) as Type);
  if (isRest(slot)) return `...${name}: ${type}[]`;
  return `${name}${isOptional(slot) ? '?' : ''}: ${type}`;
};

/** One operation as it is written in code. */
export function signature(op: Operation): string {
  const params = op.params.map(param).join(', ');
  const returns = typeName(op.returns as Type);
  if (op.owner === 'helpers') return `${op.member}(${params}): ${returns}`;
  if (op.member === 'new') return `new ${op.owner}(${params})`;
  if (op.value) return `.${op.member}: ${returns}`;
  return `${op.static ? `${op.owner}.` : '.'}${op.member}(${params}): ${returns}`;
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

/** Signatures grouped by class (`new` first), then helpers and the named types they use. */
export function buildReference(ids?: readonly string[]): string {
  const chosen = ids ? ids.map((id) => byId.get(id)).filter((op): op is Operation => !!op) : operations;
  const groups = new Map<string, Operation[]>();
  for (const op of chosen) groups.set(op.owner, [...(groups.get(op.owner) ?? []), op]);
  const out: string[] = [];
  for (const [owner, ops] of groups) {
    if (owner === 'helpers') continue;
    const sorted = [...ops].sort((a, b) => +(b.member === 'new') - +(a.member === 'new'));
    out.push(`${owner}`, ...sorted.map((op) => `  ${signature(op)}`));
  }
  const helpers = groups.get('helpers');
  if (helpers) out.push('helpers (call without a prefix)', ...helpers.map((op) => `  ${signature(op)}`));
  const body = out.join('\n');
  return [body, '', 'Types', ...typeLines(body).map((l) => `  ${l}`)].join('\n');
}

let full: string | undefined;
let compact: string | undefined;
export const fullReference = () => (full ??= buildReference());
export const compactReference = () => (compact ??= buildReference(COMPACT_OPERATIONS));
