import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../src/core/epsilon';

describe('Epsilon', () => {
  test('custom maps boolean and numeric modes', () => {
    expect(Epsilon.custom(true)).toBe(Epsilon.preferIn);
    expect(Epsilon.custom(false)).toBe(Epsilon.preferOut);
    expect(Epsilon.preferIn.value).toBe(Epsilon.value);
    expect(Epsilon.preferOut.value).toBe(-Epsilon.value);
    expect(Epsilon.custom(0.01).value).toBe(0.01);
    expect(Epsilon.custom(-0.01).value).toBe(-0.01);
  });

  test('custom returns tolerance objects as-is', () => {
    const tolerance = Epsilon.custom(0.01);
    expect(Epsilon.custom(tolerance)).toBe(tolerance);
  });

  test('slack stores squared tolerance', () => {
    expect(Epsilon.preferIn.sq).toBe(Epsilon.sq);
    expect(Epsilon.preferOut.sq).toBe(Epsilon.sq);
    expect(Epsilon.custom(0.01).sq).toBe(0.0001);
    expect(Epsilon.custom(-0.01).sq).toBe(0.0001);
  });

  test('rejects numeric tolerance between -Epsilon.value and Epsilon.value', () => {
    expect(() => Epsilon.custom(Epsilon.value / 10)).toThrow('slack numeric tolerance');
    expect(() => Epsilon.custom(-Epsilon.value / 10)).toThrow('slack numeric tolerance');
    expect(() => Epsilon.custom(Epsilon.value / 10)).toThrow('slack numeric tolerance');
  });
});
