import { describe, expect, test } from 'bun:test';
import type { Definition } from '../../src/recording/definition';
import { operations, slotType } from '../../schema/schema';
import { assignable, checkDefinition, nameProblem, parseTypeName, typeName, widen } from '../../schema/typing';

const def = (partial: Partial<Definition>): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs: [],
  functions: [],
  cells: [],
  ...partial,
});
const messages = (definition: Definition) =>
  checkDefinition(definition).issues.map((issue) => `${issue.name}: ${issue.message}`);

describe('type names', () => {
  test('every parameter and result type reads back from its name', () => {
    const all = operations.flatMap((op) => [op.returns, ...op.params.map(([, slot]) => slotType(slot))]);
    for (const type of all) expect(typeName(parseTypeName(typeName(type)))).toBe(typeName(type));
  });
  test('spacing and union order do not matter', () => {
    expect(typeName(parseTypeName('Vec2|Aabb2'))).toBe('Aabb2 | Vec2');
    expect(parseTypeName(' Vec2 [] ')).toEqual(['Vec2']);
    expect(parseTypeName('(Aabb2 | Vec2)[]')).toEqual([{ or: ['Aabb2', 'Vec2'] }]);
  });
});

describe('assignable', () => {
  test.each([
    ['number', 'Length', true],
    ['Index', 'Coordinate', true],
    ['Vec2', 'Geometry2', true],
    ['Geometry2', 'Vec2', false],
    ['LineLike2', 'Geometry2', true],
    [{ or: ['Interval2', 'null'] }, 'Interval2', true],
    [{ tuple: ['Vec2', 'Vec2'] }, ['Vec2'], true],
    [{ tuple: [] }, ['Polygon2'], true],
    [{ tuple: ['Vec2', { enum: [1] }] }, ['Vec2'], false],
    [{ enum: [0.1] }, 'AnglePrecisions', true],
    [{ enum: [0.2] }, 'AnglePrecisions', false],
    [{ enum: ['tau'] }, 'AngleDomainKind', true],
    [{ mesh: { enum: [true] } }, 'Boolean2Options', true],
    [{ meshes: { enum: [true] } }, 'Boolean2Options', false],
    [['Polygon2'], 'Boolean2ClipInput', true],
    ['Polygon2', 'Boolean2ClipInput', true],
  ] as const)('%j → %j: %p', (from, to, expected) => {
    expect(assignable(from as never, to as never)).toBe(expected);
  });
  test('literals widen to their kind', () => {
    expect(widen({ tuple: ['Vec2', 'Vec2'] })).toEqual(['Vec2']);
    expect(widen({ enum: [2] })).toBe('number');
  });
});

describe('checkDefinition', () => {
  test('a well-typed definition has no issues and every cell a type', () => {
    const { issues, refs } = checkDefinition(
      def({
        inputs: [{ name: 'r', type: 'Length', value: 1 }],
        functions: [
          {
            name: 'at',
            params: [{ name: 't', type: 'Coordinate' }],
            body: { op: 'Vec2.new', args: { x: { ref: 't' } } },
          },
        ],
        cells: [
          { name: 'p', expr: { call: 'at', args: { t: 0.5 } } },
          { name: 'c', expr: { op: 'Circle2.new', args: { center: { ref: 'p' }, radius: { ref: 'r' } } } },
          { name: 'pts', expr: [{ ref: 'p' }, { ref: 'p' }] },
        ],
      }),
    );
    expect(issues).toEqual([]);
    expect(refs.get('c')).toBe('Circle2');
    expect(refs.get('pts')).toEqual(['Vec2']);
  });

  test('scope, names, types and arguments', () => {
    expect(
      messages(
        def({
          inputs: [{ name: 'Vec2', type: 'Coordinate', value: 1 }],
          functions: [{ name: 'f', params: [{ name: 'x', type: 'Coordinate' }], body: { ref: 'a' } }],
          cells: [
            { name: 'a', expr: { ref: 'b' } },
            { name: 'b', expr: { op: 'Vec2.new', args: { x: { value: { type: 'Vec2', x: 0, y: 0 } } } } },
            { name: 'c', expr: { op: 'Circle2.new', args: { center: { ref: 'b' } } } },
            { name: 'b', expr: { op: 'Vec2.add', args: { other: { ref: 'b' } } } },
            { name: 'd', expr: { math: '+', args: [{ ref: 'b' }, 1] }, type: 'Vec2' },
          ],
        }),
      ),
    ).toEqual([
      'f: a is not defined here',
      'Vec2: "Vec2" is a vec2 name',
      'a: b is not defined here',
      'b: x is Vec2; Coordinate expected',
      'c: Circle2.new: radius is missing',
      'b: b is already a cell',
      'b: the Vec2 is missing',
      'd: an operand is Vec2; number expected',
      'd: number does not fit the declared Vec2',
    ]);
  });

  test('an output states its type, and its value fits it', () => {
    const point = { op: 'Vec2.new', args: { x: 1, y: 2 } };
    expect(messages(def({ cells: [{ name: 'p', expr: point, output: true }] }))).toEqual([
      'p: an output declares its type',
    ]);
    expect(messages(def({ cells: [{ name: 'p', expr: point, output: true, type: 'Geometry2' }] }))).toEqual([]);
    expect(messages(def({ cells: [{ name: 'p', expr: point, output: true, type: 'Polygon2' }] }))).toEqual([
      'p: Vec2 does not fit the declared Polygon2',
    ]);
  });

  test('names', () => {
    expect(nameProblem('ok_1')).toBeUndefined();
    expect(nameProblem('1x')).toMatch(/not a name/);
    expect(nameProblem('const')).toMatch(/reserved/);
    expect(nameProblem('convexHullLoop')).toMatch(/vec2 name/);
  });
});
