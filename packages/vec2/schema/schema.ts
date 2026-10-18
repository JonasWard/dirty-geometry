/** Reading vec2.schema.json: its compact type format and the operations it lists. */
import json from './vec2.schema.json';

export const ROLES = ['coordinate', 'angle', 'parameter', 'integer', 'epsilon'] as const;
export type Role = (typeof ROLES)[number];
type Composite = { or: Type[] } | { tuple: Type[] } | { object: Record<string, Slot> } | { record: Type };
export type Type = string | Type[] | { enum: (string | number | boolean | null)[] } | Composite;
export type Slot = Type | { type: Type; optional?: true; rest?: true };
type Entry = { static?: true | Entry; params?: Record<string, Slot>; returns?: Type; value?: Type } | null;
/** `id`: `Class.member`, `Class.new` or a helper's name; `value`: a field or constant that is read, not called. */
export type Operation = { id: string; static: boolean; value: boolean; params: [string, Slot][] };

export const types = json.types as Record<string, Type>;
export const slotType = (slot: Slot): Type => (typeof slot === 'object' && 'type' in slot ? slot.type : slot) as Type;
export const isOptional = (slot: Slot) => typeof slot === 'object' && 'optional' in slot;
export const isRest = (slot: Slot) => typeof slot === 'object' && 'rest' in slot;
/** A named type replaced by its body (recursively); anything else as is. */
export const resolve = (type: Type): Type => (typeof type === 'string' && type in types ? resolve(types[type]!) : type);

/** Each class's `toJson()` shape, and every recordable operation. */
export const classJson: Record<string, Type> = {};
export const operations: Operation[] = [];
const add = (id: string, entry: Entry, isStatic: boolean): void => {
  if (!entry) return;
  operations.push({ id, static: isStatic, value: 'value' in entry, params: Object.entries(entry.params ?? {}) });
  if (typeof entry.static === 'object') add(id, entry.static, true);
};
(function walk(node: any, name: string) {
  if (node === null || 'returns' in node) return add(name, node, true);
  if (!('members' in node)) return Object.entries(node).forEach(([key, child]) => walk(child, key));
  if (node.json) classJson[name] = node.json;
  if (node.new) add(`${name}.new`, { params: node.new }, true);
  for (const [member, entry] of Object.entries(node.members as Record<string, Entry>))
    add(`${name}.${member}`, entry, entry?.static === true);
})(json.modules, '');
