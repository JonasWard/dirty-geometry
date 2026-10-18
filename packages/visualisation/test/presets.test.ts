import { describe, expect, test } from 'bun:test';
import { createRecorder } from '@dirty-geometry/vec2/recording/recorder';
import { encodeDefinition } from '@dirty-geometry/vec2/schema/dense/definition';
import { choosePresets, normaliseDefinition, quantisationReport } from '../src/playground/presets';
import { decodePlaygroundHash, encodePlaygroundHash } from '../src/playground/url';

describe('presets', () => {
  test('numbers off the preset grid are reported', () => {
    const rec = createRecorder();
    rec.output('p', new rec.lib.Vec2(1.23456, 2));
    const definition = rec.definition();
    expect(quantisationReport(definition)).toEqual(['nodes.0.args.0: 1.23456 → 1.23']);
    expect(quantisationReport(definition, { coordinate: '±10@0.0001' })).toEqual(['nodes.0.args.0: 1.23456 → 1.2346']);
  });

  test('choosePresets picks the cheapest exact presets', () => {
    const rec = createRecorder();
    rec.output('p', new rec.lib.Vec2(3, 7).scale(2));
    const definition = rec.definition();
    const presets = choosePresets(definition);
    expect(presets.coordinate).toBe('0..10@1');
    expect(encodeDefinition(definition, presets).length).toBeLessThan(encodeDefinition(definition).length);
  });
});

describe('playground URL', () => {
  test('a definition with custom presets survives the URL', () => {
    const rec = createRecorder();
    rec.output('p', new rec.lib.Vec2(123.25, -40));
    const state = {
      options: { custom: { coordinate: { site: { min: -500, max: 500, precision: 0.25 } } } },
      presets: { coordinate: 'site' },
      definition: rec.definition(),
    };
    const hash = encodePlaygroundHash(state);
    expect(hash).toMatch(/^[\w-]+\/[\w-]+$/);
    const decoded = decodePlaygroundHash(`#/${hash}`);
    expect(decoded.options).toEqual(state.options);
    expect(decoded.presets).toMatchObject({ coordinate: 'site' });
    expect(decoded.definition).toEqual(normaliseDefinition(state.definition));
  });
});
