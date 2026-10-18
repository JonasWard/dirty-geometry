/** The class and helper tables recording and replay call, and how to tell which class a value is. */
import { classes, helpers } from '../../schema/bindings';

export const classTable = classes as unknown as Record<string, any>;
export const helperTable = helpers as unknown as Record<string, (...args: unknown[]) => unknown>;
const names = new Map<unknown, string>(Object.entries(classTable).map(([name, cls]) => [cls, name]));

export const classNameOf = (value: unknown): string | null => {
  const proto = value === null || value === undefined ? null : Object.getPrototypeOf(value);
  return proto ? (names.get(proto.constructor) ?? classNameOf(proto)) : null;
};
/** The type a param value is recorded as: `number`, `string`, `boolean` or a class name. */
export const typeOf = (value: unknown) => (typeof value === 'object' ? classNameOf(value) : typeof value);
export const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
export const mapValues = <T, U>(record: Record<string, T>, f: (value: T, key: string) => U) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, f(value, key)]));
