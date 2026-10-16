import { Aabb2 } from '../../bounds/aabb2';
import { Interval2 } from '../../bounds/interval2';
import { decodeJsonNumber } from '../../core/json-number';
import { codec } from '../codec';
import { isAabb2Json, isInterval2Json } from '../json-guards';

export const interval2Codec = codec(
  Interval2.type,
  isInterval2Json,
  // `null` is how JSON.stringify wrote an infinite endpoint before endpoints were encoded.
  (json) => new Interval2(decodeJsonNumber(json.min) ?? -Infinity, decodeJsonNumber(json.max) ?? Infinity),
);

export const aabb2Codec = codec(
  Aabb2.type,
  isAabb2Json,
  (json) => new Aabb2(interval2Codec.decode(json.x), interval2Codec.decode(json.y)),
);

export const boundsCodecs = [interval2Codec, aabb2Codec] as const;
