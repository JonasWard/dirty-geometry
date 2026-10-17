import { describe, expect, test } from 'bun:test';
import { createRecorder, RecordingError } from '../../src/recording/recorder';
import { Scalar } from '../../src/recording/scalar';
import { isOperationNode, type Definition } from '../../src/recording/definition';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Vec2 } from '../../src/core/vec2';

const nodeOf = (definition: Definition, op: string) => definition.nodes.find((node) => node.op === op);

describe('recorder', () => {
  test('records constructors, methods and fields with their arguments', () => {
    const rec = createRecorder();
    const { Vec2: V, Line2: L } = rec.lib;
    const line = new L(new V(0, 0), new V(3, 4));
    rec.output('mid', line.evaluate(0.5));
    rec.output('from', line.from);

    const definition = rec.definition();
    expect(definition.nodes.map((node) => node.op)).toEqual([
      'Vec2.new',
      'Vec2.new',
      'Line2.new',
      'Line2#evaluate',
      'Line2#from',
    ]);
    expect(nodeOf(definition, 'Line2#evaluate')).toMatchObject({ self: 'n2', args: [{ lit: 0.5 }] });
    expect(rec.unwrap(rec.lib.Vec2.origin()).toJson()).toEqual({ type: 'Vec2', x: 0, y: 0 });
  });

  test('scalar results of vec2 operations keep their provenance; arithmetic on them is a literal', () => {
    const rec = createRecorder();
    const { Vec2: V, Line2: L } = rec.lib;
    const line = new L(new V(0, 0), new V(3, 4));
    const length = line.length();
    expect(length).toBeInstanceOf(Scalar);
    expect(+length).toBe(5);
    const scaled = new V(1, 0).scale(length);
    const doubled = new V(1, 0).scale((length as unknown as Scalar).value * 2);
    rec.output('scaled', scaled);
    rec.output('doubled', doubled);

    const definition = rec.definition();
    const scaleNodes = definition.nodes.filter((node) => node.op === 'Vec2#scale');
    expect(scaleNodes.map((node) => (isOperationNode(node) ? node.args[0] : null))).toEqual([
      { ref: 'n3' },
      { lit: 10 },
    ]);
  });

  test('recorded objects stay the same object, pass instanceof and are immutable', () => {
    const rec = createRecorder();
    const line = new rec.lib.Line2(new rec.lib.Vec2(0, 0), new rec.lib.Vec2(1, 0));
    expect(line.from).toBe(line.from);
    expect(line).toBeInstanceOf(Line2);
    expect(line).toBeInstanceOf(rec.lib.Line2);
    expect(() => {
      (line as { from: unknown }).from = null;
    }).toThrow(RecordingError);
  });

  test('statics, constants, rest arguments, operation functions, arrays and result fields', () => {
    const rec = createRecorder();
    const { Vec2: V, Polygon2, Epsilon, Boolean2, Interval2 } = rec.lib;
    const a = new V(0, 0);
    const b = new V(2, 0);
    const c = new V(2, 2);
    const square = new Polygon2([a, b, c, new V(0, 2)]);
    rec.output('center', V.center(a, b, c));
    rec.output('epsilon', Epsilon.preferIn);
    expect(Epsilon.preferIn).toBe(Epsilon.preferIn);
    expect(b.parallel(new V(1, 0), Epsilon.preferIn)).toBe(true);
    rec.output('segment', square.segments()[1]);
    rec.output('union', Boolean2.union([square]).polygons[0]);
    rec.output('ray', new Interval2(0, Infinity));
    rec.output('mesh', rec.lib.ConstrainedDelaunay.triangulate([a, b, c]));
    rec.output('hull', rec.lib.helpers.convexHullLoop([a, b, c]));

    const definition = rec.definition();
    const ops = definition.nodes.map((node) => node.op);
    expect(ops).toContain('Vec2.center');
    expect(ops.filter((op) => op === 'Epsilon.preferIn')).toHaveLength(1);
    expect(ops).toContain('item');
    expect(ops).toContain('field');
    expect(ops).toContain('ConstrainedDelaunay.triangulate');
    expect(ops).toContain('operations/helpers/cdt/hull:convexHullLoop');
    expect(nodeOf(definition, 'Vec2.center')).toMatchObject({ args: [{ ref: 'n0' }, { ref: 'n1' }, { ref: 'n2' }] });
    expect(nodeOf(definition, 'Interval2.new')).toMatchObject({ args: [{ lit: 0 }, { number: 'Infinity' }] });
  });

  test('vec2 values made outside the recorder are stored through their codec', () => {
    const rec = createRecorder();
    const outside = new Line2(new Vec2(0, 0), new Vec2(1, 1));
    rec.output('point', rec.lib.Line2.definitionOf(outside));
    expect(nodeOf(rec.definition(), 'Line2.definitionOf')).toMatchObject({ args: [{ value: outside.toJson() }] });
  });

  test('params are nodes and stay in the definition even when unused', () => {
    const rec = createRecorder();
    const width = rec.param('width', 3);
    rec.param('unused', 1);
    rec.output('point', new rec.lib.Vec2(width, 0));
    const definition = rec.definition();
    expect(Object.keys(definition.params)).toEqual(['width', 'unused']);
    expect(definition.params.width).toEqual({ node: 'n0', type: { kind: 'number' }, value: { lit: 3 } });
    expect(() => rec.param('width', 4)).toThrow(RecordingError);
  });

  test('unrecordable operations warn by default and throw in strict mode', () => {
    const loose = createRecorder();
    const polygon = new loose.lib.Polygon2([
      new loose.lib.Vec2(0, 0),
      new loose.lib.Vec2(1, 0),
      new loose.lib.Vec2(0, 1),
    ]);
    expect(polygon.toJson().type).toBe('Polygon2');
    expect(loose.warnings[0]).toContain('Polygon2#toJson ran unrecorded');

    const strict = createRecorder({ strict: true });
    const strictPolygon = new strict.lib.Polygon2([
      new strict.lib.Vec2(0, 0),
      new strict.lib.Vec2(1, 0),
      new strict.lib.Vec2(0, 1),
    ]);
    expect(() => strictPolygon.toJson()).toThrow(RecordingError);
  });

  test('outputs must be recorded values, and definitions are plain JSON', () => {
    const rec = createRecorder();
    expect(() => rec.output('plain', new Vec2(1, 1))).toThrow(RecordingError);
    rec.output('point', new rec.lib.Vec2(1, 1));
    const definition = rec.definition();
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });
});
