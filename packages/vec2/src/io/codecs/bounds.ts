import { Aabb2 } from '../../bounds/aabb2';
import { Interval2 } from '../../bounds/interval2';
import { codec } from '../codec';
import { isAabb2Json, isInterval2Json } from '../json-guards';

const end = (value: unknown, unbounded: number) =>
  typeof value === 'number' ? value : value === 'Infinity' ? Infinity : value === '-Infinity' ? -Infinity : unbounded;

export const interval2Codec = codec(
  Interval2.type,
  isInterval2Json,
  // `null` is an unbounded end and `min > max` the empty interval; "Infinity" / "-Infinity" strings are read from older JSON.
  (json) => {
    const [min, max] = [end(json.min, -Infinity), end(json.max, Infinity)];
    return min > max ? Interval2.empty() : new Interval2(min, max);
  },
);

export const aabb2Codec = codec(
  Aabb2.type,
  isAabb2Json,
  (json) => new Aabb2(interval2Codec.decode(json.x), interval2Codec.decode(json.y)),
);

export const boundsCodecs = [interval2Codec, aabb2Codec] as const;
