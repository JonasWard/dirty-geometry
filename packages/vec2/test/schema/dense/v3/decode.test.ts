import { describe, expect, test } from 'bun:test';
import { decodeDefinitionV3 } from '../../../../schema/dense/v3/decode';
import fixtures from './fixtures.json';

const CUSTOM = { custom: { Coordinate: { site: { min: -500, max: 500, precision: 0.25 } } } };

describe('frozen version 3 decoder', () => {
  test.each(fixtures.filter((f) => f.dense))('$name decodes as it did when it was written', ({ dense, definition }) => {
    expect(decodeDefinitionV3(dense).definition).toEqual(definition as never);
  });

  test('a link with custom presets decodes with those presets', () => {
    const fixture = fixtures.find((f) => f.name === 'plate-custom')!;
    const { definition, presets } = decodeDefinitionV3(fixture.url.split('/')[1]!, CUSTOM);
    expect(definition).toEqual(fixture.definition as never);
    expect(presets.Coordinate).toBe('site');
  });

  test('a string of another schema is rejected', () => {
    expect(() => decodeDefinitionV3('AAAA')).toThrow();
  });
});
