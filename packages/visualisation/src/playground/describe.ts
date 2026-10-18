/** Short previews of node values for the builder rows. */
import { classNameOf } from '@dirty-geometry/vec2/recording/runtime';

export function describeValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const kinds = [
      ...new Set(
        value.map((item) => (typeof item === 'object' && item ? (classNameOf(item) ?? 'object') : typeof item)),
      ),
    ];
    return `[${value.length}] ${kinds.join(' | ')}`;
  }
  if (typeof value === 'object') {
    const name = classNameOf(value);
    if (name === 'Vec2') {
      const { x, y } = value as { x: number; y: number };
      return `Vec2(${+x.toFixed(3)}, ${+y.toFixed(3)})`;
    }
    if (name) return name;
    return `{ ${Object.keys(value).join(', ')} }`;
  }
  return typeof value;
}

/** A stored value's JSON in short: `Vec2(1, 2)`, `Circle2`. */
export function describeJson(json: unknown): string {
  const value = json as { type?: string; x?: number; y?: number } | null;
  if (value?.type === 'Vec2') return `Vec2(${value.x}, ${value.y})`;
  return value?.type ? `${value.type} { … }` : 'value';
}
