import { describe, expect, test } from 'bun:test';
import { recordPlate } from '../../examples/definitions/plate';
import { checkDefinition } from '../../schema/typing';
import { evaluate } from '../../src/recording/evaluate';
import { fromV3 } from '../../src/recording/migrate';
import { createRecorder } from '../../src/recording/recorder';
import { evaluateDefinition } from '../../src/recording/replay';
import type { DefinitionV3 } from '../../src/recording/v3';
import fixtureJson from '../schema/dense/v3/fixtures.json';

const fixtures = fixtureJson as unknown as { name: string; definition: DefinitionV3 }[];

const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_, v) => (v?.toJson ? v.toJson() : v)));
/** Outputs by name, with names made identifiers as the migration does. */
const byName = (outputs: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(json(outputs)).map(([k, v]) => [k.replace(/[^\w$]/g, '_'), v]));

describe('fromV3', () => {
  test('the plate becomes six cells, the circle written into the hole', () => {
    const definition = fromV3(recordPlate());
    expect(definition.inputs.map((input) => `${input.name}: ${input.type}`)).toEqual([
      'width: Coordinate',
      'height: Coordinate',
      'holeRadius: Length',
      'holeX: Coordinate',
      'holeSegments: Index',
    ]);
    expect(definition.cells.map((cell) => `${cell.name}${cell.output ? '*' : ''}`)).toEqual([
      'outline*',
      'hole*',
      'subtract',
      'plate*',
      'mesh*',
      'area*',
    ]);
    expect(definition.cells.filter((c) => c.output).map((c) => `${c.name}: ${c.type}`)).toEqual([
      'outline: Polygon2',
      'hole: Polygon2',
      'plate: Polygon2[]',
      'mesh: TriMesh2',
      'area: number',
    ]);
    const hole = definition.cells.find((cell) => cell.name === 'hole')!.expr as any;
    expect(hole.op).toBe('Polygon2.fromCircle2');
    expect(hole.args.segments).toEqual({ ref: 'holeSegments' });
    expect(hole.args.circle.op).toBe('Circle2.new');
  });

  test.each(fixtures.map((f) => [f.name, f.definition] as const))(
    '%s evaluates to the same outputs as the version 3 replay, with no type issues',
    (_, v3) => {
      const definition = fromV3(v3);
      expect(checkDefinition(definition).issues).toEqual([]);
      expect(byName(evaluate(definition).outputs)).toEqual(byName(evaluateDefinition(v3).outputs));
    },
  );

  test('outputs sharing a node, outputs of a param, and names that are not identifiers', () => {
    const rec = createRecorder();
    const size = rec.param('size', 2);
    const v = new rec.lib.Vec2(size, 1);
    rec.output('a', v);
    rec.output("it's", v);
    rec.output('size', size);
    const definition = fromV3(rec.definition());
    expect(definition.cells.map((cell) => [cell.name, cell.expr])).toEqual([
      ['a', { op: 'Vec2.new', args: { x: { ref: 'size' }, y: 1 } }],
      ['it_s', { ref: 'a' }],
      ['size2', { ref: 'size' }],
    ]);
    expect(Object.keys(evaluate(definition).outputs)).toEqual(['a', 'it_s', 'size2']);
  });

  test('omitted middle arguments are left out; rest arguments become a list', () => {
    const rec = createRecorder();
    const { Vec2, Aabb2, Frame2 } = rec.lib;
    rec.output('box', Aabb2.fromPoints(new Vec2(0, 0), new Vec2(2, 1)));
    rec.output('frame', new Frame2(undefined, undefined, new Vec2(0, 2)));
    const [box, frame] = fromV3(rec.definition()).cells;
    expect((box!.expr as any).args.points).toHaveLength(2);
    expect(Object.keys((frame!.expr as any).args)).toEqual(['yAxis']);
  });
});
