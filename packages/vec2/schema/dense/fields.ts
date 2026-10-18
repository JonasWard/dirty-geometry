/** densing fields from the compact types: each class's `json` shape is a template, so vec2 values pass unchanged. */
import * as d from 'densing';
import { classJson, isOptional, resolve, ROLES, slotType, type Slot, type Type } from '../schema';

export const MAX_ITEMS = 65535;
const templates = new Map<string, d.Template>();
/** A reference to a template built once per key (templates may refer to themselves). */
const shared = (name: string, key: string, build: () => d.DenseField) =>
  d.reference(name, () => templates.get(key) ?? templates.set(key, d.template(build())).get(key)!);

export function field(name: string, type: Type): d.DenseField {
  if (typeof type === 'string') {
    if (type in classJson) return shared(name, type, () => field(type, classJson[type]!));
    if (type === 'boolean') return d.bool(name);
    if (type === 'number') return d.referenceNumeric(name, 'coordinate');
    if ((ROLES as readonly string[]).includes(type)) return d.referenceNumeric(name, type);
    if (resolve(type) === type) throw new Error(`No dense layout for ${type}`);
    return field(name, resolve(type));
  }
  if (Array.isArray(type)) return d.array(name, 0, MAX_ITEMS, field('item', type[0]!));
  if ('tuple' in type) return d.array(name, type.tuple.length, type.tuple.length, field('item', type.tuple[0]!));
  if ('enum' in type) {
    const numbers = type.enum.filter((value) => typeof value === 'number');
    if (numbers.length) return d.fixed(name, Math.min(...numbers), Math.max(...numbers), Math.min(...numbers));
    // densing enums need two options: a constant (a class's `type` tag) gets an unused second one, 1 bit.
    return d.enumeration(name, [...type.enum.map(String), '', ''].slice(0, Math.max(2, type.enum.length)));
  }
  if (!('object' in type)) throw new Error(`No dense layout for ${JSON.stringify(type)}`);
  const slot = ([key, value]: [string, Slot]) =>
    isOptional(value) ? d.optional(key, field(key, slotType(value))) : field(key, slotType(value));
  return d.object(name, ...Object.entries(type.object).map(slot));
}

/** Any vec2 value: a union keyed by the `type` tag each class's json carries, so `toJson()` output is its data. */
export const anyValue = (name: string) =>
  shared(name, '$value', () => {
    const tag = (json: any): string => json.object.type.enum[0];
    const fields = (json: Type) => (field('value', json) as d.ObjectField).fields.filter((f) => f.name !== 'type');
    const variants = Object.fromEntries(Object.values(classJson).map((json) => [tag(json), fields(json)]));
    return d.union('$value', d.enumeration('type', Object.keys(variants)), variants);
  });
