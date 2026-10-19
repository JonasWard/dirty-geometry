import { describe, expect, test } from 'bun:test';
import { createRecorder } from '../../src/recording/recorder';
import { DefinitionError } from '../../src/recording/definition';
import { evaluateDefinition } from '../../src/recording/replay';
import type { DefinitionV3 as Definition } from '../../src/recording/v3';
import { ConstrainedDelaunay } from '../../src/operations/constrained-delaunay';
import { Vec2 } from '../../src/core/vec2';
import { recordPlate } from '../../examples/definitions/plate';

/** JSON form of any output (vec2 values, arrays of them, numbers). */
const toJson = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(toJson)
    : typeof value === 'object' && value !== null && 'toJson' in value
      ? (value as { toJson(): unknown }).toJson()
      : value;

const viaText = (definition: Definition): Definition => JSON.parse(JSON.stringify(definition));

function recordLine() {
  const rec = createRecorder({ strict: true });
  const { Vec2: V, Line2 } = rec.lib;
  const width = rec.param('width', 3);
  const tip = new V(width, 4);
  const line = new Line2(new V(0, 0), tip);
  const length = line.length();
  rec.output('scaled', new V(1, 0).scale(length));
  rec.output('fixed', new V(1, 0).scale(+length * 2));
  rec.output('length', length);
  return { rec };
}

describe('replay', () => {
  test('a definition replays from JSON text to the same values', () => {
    const { rec } = recordLine();
    const { outputs } = evaluateDefinition(viaText(rec.definition()));
    expect(toJson(outputs.scaled)).toEqual({ type: 'Vec2', x: 5, y: 0 });
    expect(toJson(outputs.fixed)).toEqual({ type: 'Vec2', x: 10, y: 0 });
    expect(outputs.length).toBe(5);
  });

  test('param overrides flow through recorded scalars; arithmetic stays the recorded literal', () => {
    const { rec } = recordLine();
    const { outputs } = evaluateDefinition(rec.definition(), { params: { width: 0 } });
    expect(outputs.length).toBe(4);
    expect(toJson(outputs.scaled)).toEqual({ type: 'Vec2', x: 4, y: 0 });
    expect(toJson(outputs.fixed)).toEqual({ type: 'Vec2', x: 10, y: 0 });
  });

  test('operations, arrays, result fields, constants, rest arguments and infinities round-trip', () => {
    const rec = createRecorder({ strict: true });
    const { Vec2: V, Polygon2, Boolean2, Interval2, Epsilon } = rec.lib;
    const points = [new V(0, 0), new V(4, 0), new V(4, 3), new V(0, 3), new V(2, 1)];
    const square = new Polygon2(points.slice(0, 4));
    const recorded = {
      mesh: rec.lib.ConstrainedDelaunay.triangulate(points, [[0, 2]]),
      union: Boolean2.union([square]).polygons,
      segment: square.segments()[2],
      center: V.center(...points),
      ray: new Interval2(1, Infinity),
    };
    for (const [name, value] of Object.entries(recorded)) rec.output(name, value);
    rec.output('parallel', points[1]!.subtract(points[0]!).parallelCondition(new V(1, 0), Epsilon.preferIn));
    const original = Object.fromEntries(
      Object.entries(recorded).map(([name, value]) => [name, toJson(rec.unwrap(value))]),
    );

    const replayed = evaluateDefinition(viaText(rec.definition())).outputs;
    for (const [name, json] of Object.entries(original)) expect(toJson(replayed[name])).toEqual(json);
    expect(toJson(replayed.mesh)).toEqual(
      ConstrainedDelaunay.triangulate(
        points.map((p) => rec.unwrap(p)),
        [[0, 2]],
      ).toJson(),
    );
    expect(replayed.parallel).toBe('parallel');
  });

  test('values made outside the recorder are decoded through the codec registry', () => {
    const rec = createRecorder();
    rec.output('moved', rec.lib.Vec2.center(new Vec2(2, 2), new rec.lib.Vec2(0, 0)));
    expect(toJson(evaluateDefinition(viaText(rec.definition())).outputs.moved)).toEqual({ type: 'Vec2', x: 1, y: 1 });
  });

  test('the plate example: new params move the hole and change the area', () => {
    const definition = viaText(recordPlate());
    const base = evaluateDefinition(definition).outputs;
    const wide = evaluateDefinition(definition, { params: { width: 10, holeRadius: 1.5 } }).outputs;
    expect(base.area).toBe(24);
    expect(wide.area).toBe(40);
    expect(toJson((wide.hole as { vertices: Vec2[] }).vertices[0])).toEqual({ type: 'Vec2', x: 6.5, y: 2 });
    expect(toJson(wide)).not.toEqual(toJson(base));
    expect(
      toJson(
        evaluateDefinition(
          viaText(recordPlate({ width: 10, height: 4, holeRadius: 1.5, holeX: 0.5, holeSegments: 16 })),
        ).outputs,
      ),
    ).toEqual(toJson(wide));
  });

  test('param overrides are checked by name and type', () => {
    const { rec } = recordLine();
    const definition = rec.definition();
    expect(() => evaluateDefinition(definition, { params: { height: 2 } })).toThrow(DefinitionError);
    expect(() => evaluateDefinition(definition, { params: { width: 'wide' } })).toThrow(DefinitionError);
  });

  test('older definition versions are rejected with a clear error', () => {
    const old = { ...recordLine().rec.definition(), version: 2 } as unknown as Definition;
    expect(() => evaluateDefinition(old)).toThrow(/re-record/);
  });

  test('a call that no longer exists fails clearly', () => {
    const definition = recordLine().rec.definition();
    const renamed: Definition = {
      ...definition,
      nodes: definition.nodes.map((node) => (node.op === 'Line2.length' ? { ...node, op: 'Line2.len' } : node)),
    };
    expect(() => evaluateDefinition(renamed)).toThrow(/Line2.len does not exist/);
  });
});

test('partial replay returns the values computed before the first failure', () => {
  const rec = createRecorder();
  const { Vec2: V, Line2 } = rec.lib;
  const a = new V(0, 0);
  rec.output('a', a);
  rec.output('line', new Line2(a, new V(1, 0)));
  const definition = rec.definition();
  const broken: Definition = {
    ...definition,
    nodes: definition.nodes.map((node) =>
      node.op === 'Line2.new' && 'args' in node ? { ...node, args: [{ ref: 'n0' }, { ref: 'n9' }] } : node,
    ),
  };
  expect(() => evaluateDefinition(broken)).toThrow(DefinitionError);
  const partial = evaluateDefinition(broken, { partial: true });
  expect(partial.error?.node).toBe('n2');
  expect(Object.keys(partial.outputs)).toEqual(['a']);
  expect(partial.values.size).toBe(2);
});
