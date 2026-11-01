import { describe, expect, test } from 'bun:test';
import { hash32, jittered, smooth, white } from '../src/random';

describe('random', () => {
  // Saved definitions depend on these exact values: never update them, add a new variety instead.
  test('golden values', () => {
    expect([0, 1, 2, 3].map((i) => hash32(42, i))).toEqual([436909293, 3885832024, 3515534355, 324942827]);
    expect(hash32(0, 0)).toBe(2926543089);
    expect(hash32(-7, 1000)).toBe(336431223);
    expect(white(1, 0)).toBe(0.1368145691230893);
    expect(smooth(3, 0.5)).toBe(0.19430388463661075);
    expect(smooth(3, 2.25, 0.5)).toBe(0.5114719610428438);
    expect(jittered(5, 2, 10)).toBe(0.2970984379993752);
  });

  test('same seed and index, same value; another seed, other values', () => {
    expect(white(7, 3)).toBe(white(7, 3));
    const a = Array.from({ length: 20 }, (_, i) => white(1, i));
    const b = Array.from({ length: 20 }, (_, i) => white(2, i));
    expect(a).not.toEqual(b);
  });

  test('white is in [0, 1) and roughly uniform', () => {
    const n = 20000;
    const bins = new Array(10).fill(0);
    for (let i = 0; i < n; i++) {
      const v = white(123, i);
      expect(v >= 0 && v < 1).toBe(true);
      bins[Math.floor(v * 10)]++;
    }
    for (const count of bins) expect(Math.abs(count - n / 10)).toBeLessThan(n / 10 / 10);
  });

  test('jittered puts one value in each slot', () => {
    for (let i = 0; i < 16; i++) {
      const v = jittered(9, i, 16);
      expect(v >= i / 16 && v < (i + 1) / 16).toBe(true);
    }
    expect(() => jittered(1, 0, 0)).toThrow('count');
  });

  test('smooth is continuous, hits its lattice values, and is not white', () => {
    for (let t = -3; t < 3; t += 0.01) {
      const v = smooth(4, t);
      expect(v >= 0 && v < 1).toBe(true);
      expect(Math.abs(smooth(4, t + 0.001) - v)).toBeLessThan(0.01);
    }
    expect(smooth(4, 2)).toBe(smooth(4, 2.5 * 0.8, 1));
    expect(smooth(4, 2)).not.toBe(white(4, 2));
    expect(() => smooth(1, 0, 0)).toThrow('scale');
  });
});
