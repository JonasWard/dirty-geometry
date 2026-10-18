/** Reading vec2.schema.json: its number types, compact types and the operations it lists. */
import { SKIP_MEMBERS } from './policy';
import json from './vec2.schema.json';

/** The semantic number types (`Coordinate`, `Radians`, …), in schema order. */
export const NUMBER_TYPES = Object.keys(json.numbers);
/** A name, `[T]`, `{ enum }`, `{ or }`, `{ tuple }`, `{ record }`, or an object type written as its fields. */
export type Type = string | Type[] | { [key: string]: any };
export type Slot = Type | { type: Type; optional?: true; rest?: true };
type Entry = { static?: true; params?: Record<string, Slot>; returns?: Type; value?: Type } | null;
/**
 * `id`: `Class.member` or `helpers.name`; `path`: where it sits in the schema (folders, class, member); `owner`: the
 * class (`helpers` for a helper); `value`: a field read rather than a call; `returns`: the result (or field) type.
 */
export type Operation = {
  id: string;
  path: string[];
  owner: string;
  member: string;
  static: boolean;
  value: boolean;
  params: [string, Slot][];
  returns: Type;
};

export const types = json.types as Record<string, Type>;
/** `{ or: [...] }` and the like: exactly one reserved key. */
export const isKind = (type: unknown, kind: string): boolean =>
  !!type && typeof type === 'object' && !Array.isArray(type) && Object.keys(type).length === 1 && kind in type;
const isFlagged = (slot: Slot) => typeof slot === 'object' && ('optional' in slot || 'rest' in slot);
export const slotType = (slot: Slot): Type => (isFlagged(slot) ? (slot as { type: Type }).type : slot);
export const isOptional = (slot: Slot) => isFlagged(slot) && 'optional' in (slot as object);
export const isRest = (slot: Slot) => isFlagged(slot) && 'rest' in (slot as object);
/** A named type replaced by its body (recursively); anything else as is. */
export const resolve = (type: Type): Type => (typeof type === 'string' && type in types ? resolve(types[type]!) : type);

/** Each class's JSON type (`Vec2` → `Vec2Json`), every class, and every recordable operation. */
export const classJson: Record<string, string> = {};
export const classes: string[] = [];
export const operations: Operation[] = [];
const add = (id: string, path: string[], entry: Entry, isStatic: boolean): void => {
  if (!entry) return;
  const params = Object.entries(entry.params ?? {});
  const [owner, member] = id.split('.') as [string, string];
  const returns = ('value' in entry ? entry.value : entry.returns) ?? (member === 'new' ? owner : 'void');
  operations.push({ id, path, owner, member, static: isStatic, value: 'value' in entry, params, returns });
};
(function walk(node: any, path: string[]) {
  const name = path.at(-1)!;
  if (node === null || 'returns' in node) return add(`helpers.${name}`, path, node, true);
  if (!('members' in node)) return Object.entries(node).forEach(([key, child]) => walk(child, [...path, key]));
  classes.push(name);
  if (node.new) add(`${name}.new`, [...path, 'new'], { params: node.new }, true);
  for (const [member, entry] of Object.entries(node.members as Record<string, Entry>)) {
    if (member === 'toJson') classJson[name] = entry!.returns as string;
    if (entry && !SKIP_MEMBERS.has(member)) add(`${name}.${member}`, [...path, member], entry, entry.static === true);
  }
})(json.modules, []);

/** Operations by id. */
export const operationById: ReadonlyMap<string, Operation> = new Map(operations.map((op) => [op.id, op]));
/** A class's JSON tag (`toJson().type`) → the class (`CellCollection` → `GridCell2Collection`). */
export const classOfTag: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(classJson).map(([cls, json]) => [json.replace(/Json$/, ''), cls]),
);
