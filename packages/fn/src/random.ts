/**
 * Seeded random numbers without state: each value is a hash of `(seed, index)`, so the same seed and index always
 * give the same value, in any order. A definition can be re-run, cached or partly re-evaluated without its random
 * values moving.
 *
 * The varieties go from fully random to smooth:
 * - `white`: every index independent; values can clump.
 * - `jittered`: one value in each of `count` equal slots, so no big gaps.
 * - `smooth`: value noise along `t`; nearby `t` give nearby values.
 *
 * The hash is lowbias32 (Chris Wellons). Saved definitions depend on its exact output, which tests pin: do not change
 * it; add a new variety with a new name instead.
 */

/** lowbias32: a 32-bit integer mixer with very low bias. Returns an unsigned 32-bit integer. */
export function lowbias32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Whole numbers wrap to 32 bits; fractions are floored first. */
const int32 = (n: number): number => Math.floor(n) | 0;

/** Added to the seed so seed 0 does not hit lowbias32's fixed point at 0 (the golden ratio, 2³²/φ). */
const SEED_OFFSET = 0x9e3779b9;
/** An unsigned 32-bit hash of `(seed, index)`. */
export const hash32 = (seed: number, index: number): number =>
  lowbias32((lowbias32((int32(seed) + SEED_OFFSET) | 0) + int32(index)) | 0);

const TO_UNIT = 1 / 4294967296;
/** Different varieties use different streams, so `smooth` is not `white` in disguise. */
const SMOOTH_STREAM = 0x5bd1e995;

/** A value in `[0, 1)`, independent for every `(seed, index)`. */
export const white = (seed: number, index: number): number => hash32(seed, index) * TO_UNIT;

/** A value in slot `index` of `count` equal slots of `[0, 1)`: `(index + white) / count`. */
export function jittered(seed: number, index: number, count: number): number {
  if (!(count > 0)) throw new RangeError(`jittered needs a count above 0, got ${count}`);
  return (Math.floor(index) + white(seed, index)) / count;
}

/**
 * 1D value noise in `[0, 1)`: random values at whole multiples of `scale`, blended with a smoothstep between them.
 * Continuous in `t`; one `scale` apart the values are unrelated.
 */
export function smooth(seed: number, t: number, scale = 1): number {
  if (!(scale > 0)) throw new RangeError(`smooth needs a scale above 0, got ${scale}`);
  const x = t / scale;
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const s = int32(seed) ^ SMOOTH_STREAM;
  const a = white(s, i);
  return a + (white(s, i + 1) - a) * u;
}

export type RandomKind = 'white' | 'jittered' | 'smooth';
export const RANDOM_KINDS: readonly RandomKind[] = ['white', 'jittered', 'smooth'];
