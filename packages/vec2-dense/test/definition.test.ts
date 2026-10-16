import { describe, expect, test } from 'bun:test';
import { densing } from 'densing';
import { createRecorder } from '@dirty-geometry/vec2/recording/recorder';
import { evaluateDefinition } from '@dirty-geometry/vec2/recording/replay';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';
import { createDefinitionSchema, recordableOperations } from '../src/definition-schema';
import {
  decodeDefinition,
  definitionToDenseData,
  encodeDefinition,
  normaliseDefinition,
  quantisationReport,
} from '../src/convert';
import { choosePresets } from '../src/presets';
import { decodePlaygroundHash, encodePlaygroundHash } from '../src/url';

/** Deep equality with a 1e-12 tolerance on numbers (angles go through degrees). */
function expectClose(actual: unknown, expected: unknown, path = ''): void {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    expect(Math.abs((actual as number) - expected)).toBeLessThan(1e-12);
    return;
  }
  if (typeof expected !== 'object' || expected === null) {
    expect(actual).toEqual(expected);
    return;
  }
  expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) expectClose((actual as any)[key], (expected as any)[key], `${path}.${key}`);
}

const roundTrip = (definition: Definition, presets = {}) =>
  decodeDefinition(encodeDefinition(definition, presets)).definition;

function recordMixed(): Definition {
  const rec = createRecorder({ strict: true });
  const { Vec2: V, Line2, Polygon2, Boolean2, Interval2, Epsilon, Circle2 } = rec.lib;
  const size = rec.param('size', 4);
  const a = new V(0, 0);
  const b = new V(size, 0);
  const square = new Polygon2([a, b, new V(size, size), new V(0, size)]);
  const other = new Polygon2([new V(2, 2), new V(6, 2), new V(6, 6), new V(2, 6)]);
  rec.output('union', Boolean2.union([square, other], { slack: Epsilon.custom(0.0005) }).polygons);
  rec.output('mesh', rec.lib.ops.constrainedDelaunay([a, b, new V(1, 3)], [[0, 2], 1]));
  rec.output('ray', new Interval2(-1, Infinity));
  rec.output('point', new Line2(a, b).evaluate(0.25));
  rec.output('rim', new Circle2(new V(1, 1), 0.5).evaluate(Math.PI / 3));
  rec.output('outside', V.center(new Vec2(2, 4), a));
  return rec.definition();
}

describe('definition schema', () => {
  test('every recordable operation is a node variant', () => {
    const { schema } = createDefinitionSchema();
    const node = schema.templates!.find((template) => template.name === 'node');
    expect(node?.type).toBe('union');
    const options = node?.type === 'union' ? node.discriminator.options : [];
    for (const [id] of recordableOperations()) expect(options).toContain(id);
    expect(options).toContain('param');
  });

  test('the plate definition round-trips and replays to the same result', () => {
    const definition = recordPlate();
    const decoded = roundTrip(definition);
    expectClose(decoded, normaliseDefinition(definition));
    expect(evaluateDefinition(decoded).outputs.area).toBe(24);
    expect(encodeDefinition(definition).length).toBeLessThan(JSON.stringify(definition).length / 5);
  });

  test('lists, tuples, options, epsilons, infinities, angles and outside values round-trip', () => {
    const definition = recordMixed();
    expectClose(roundTrip(definition), normaliseDefinition(definition));
    const replayed = evaluateDefinition(roundTrip(definition)).outputs;
    const original = evaluateDefinition(definition).outputs;
    expect((replayed.mesh as { toJson(): unknown }).toJson()).toEqual(
      (original.mesh as { toJson(): unknown }).toJson(),
    );
  });

  test('numbers off the preset grid are snapped, and reported', () => {
    const rec = createRecorder();
    rec.output('p', new rec.lib.Vec2(1.23456, 2));
    const definition = rec.definition();
    expect(quantisationReport(definition)).toEqual(['nodes.0.args.0.lit: 1.23456 → 1.23']);
    expect(quantisationReport(definition, { coordinate: '±10@0.0001' })).toEqual([
      'nodes.0.args.0.lit: 1.23456 → 1.2346',
    ]);
    expect(() => definitionToDenseData(definition, { coordinate: '0..1@0.1' })).toThrow(RangeError);
  });

  test('choosePresets picks the cheapest exact presets', () => {
    const rec = createRecorder();
    rec.output('p', new rec.lib.Vec2(3, 7).scale(2));
    const definition = rec.definition();
    const presets = choosePresets(definition);
    expect(presets.coordinate).toBe('0..10@1');
    expect(encodeDefinition(definition, presets).length).toBeLessThan(encodeDefinition(definition).length);
  });

  test('payloads from another vec2 schema are rejected with a clear error', () => {
    const { schema } = createDefinitionSchema();
    const data = { ...definitionToDenseData(recordPlate()), stamp: 1 };
    expect(() => decodeDefinition(densing(schema, data))).toThrow(/another version of the vec2 operations/);
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
    expectClose(decoded.definition, normaliseDefinition(state.definition));
  });
});
