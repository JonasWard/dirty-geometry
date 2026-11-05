import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import ts from 'typescript';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { fromV3 } from '@dirty-geometry/vec2/recording/migrate';
import { CodeError, parseDefinition } from '../src/playground/model/parse';
import { printDefinition } from '../src/playground/model/print';
import { choosePresets } from '../src/playground/presets';
import { encodeAppState } from '../src/playground/url';
import { createDefinitionSchema } from '@dirty-geometry/vec2/schema/dense/definition';
import { arbitraryDefinition } from '../../vec2/test/recording/arbitrary';

const plate = () => fromV3(recordPlate());
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_, v) => (v?.toJson ? v.toJson() : v)));
const parseError = (code: string): CodeError => {
  try {
    parseDefinition(code);
  } catch (error) {
    if (error instanceof CodeError) return error;
    throw error;
  }
  throw new Error('parsed without an error');
};
const wrap = (body: string, inputs = 'w: Coordinate = 2') =>
  `export function definition(${inputs}) {\n${body}\n  return {};\n}\n`;

describe('printing and parsing', () => {
  test('the plate prints as a function of its inputs, one const per cell', () => {
    const code = printDefinition(plate());
    expect(code).toContain(
      "import { Aabb2, Boolean2, Circle2, Polygon2, TriMesh2, Vec2 } from '@dirty-geometry/vec2/schema/bindings';",
    );
    expect(code).toContain(
      'export function definition(\n  width: Coordinate = 6,\n  height: Coordinate = 4,\n  holeRadius: Length = 1,\n',
    );
    expect(code).toContain(
      '  const outline = Polygon2.fromAabb2(Aabb2.fromMinMax(new Vec2(0, 0), new Vec2(width, height)));',
    );
    expect(code).toContain('  const hole = Polygon2.fromCircle2(\n');
    expect(code).toContain('  const subtract = Boolean2.subtract([outline], hole, { mesh: true });');
    expect(code).toContain('  const plate = subtract.polygons;');
    expect(code).toContain('  return { outline, hole, plate, mesh, area };');
  });

  test('random definitions read back as they were printed', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const definition = arbitraryDefinition(seed);
      expect({ seed, definition: parseDefinition(printDefinition(definition)) }).toEqual({ seed, definition });
    }
  });

  test('the parsed plate evaluates to the same outputs', () => {
    const definition = plate();
    expect(json(evaluate(parseDefinition(printDefinition(definition))).outputs)).toEqual(
      json(evaluate(definition).outputs),
    );
  });

  test('editing the code changes the definition', () => {
    const code = printDefinition(plate()).replace('width: Coordinate = 6', 'width: Coordinate = 8');
    const definition = parseDefinition(code);
    expect(definition.inputs[0]).toEqual({ name: 'width', type: 'Coordinate', value: 8 });
    expect(evaluate(definition).outputs.area).toBe(32);
  });

  test('user functions, arithmetic, stored values, left-out arguments and declared types', () => {
    const code = [
      'function at(x: Coordinate, y: Coordinate) {',
      '  return new Vec2(x, y * 2);',
      '}',
      '',
      'export function definition(w: Coordinate = 2, origin: Vec2 = value({ type: "Vec2", x: 0, y: 0 })): { p: Vec2; d: Length } {',
      '  const p = at(w - 1, -(w + 1) / 2);',
      '  const frame = new Frame2(undefined, undefined, p);',
      '  const d = p.distance(origin) * -1.5;',
      '  const box = Aabb2.fromPoints(p, origin, ...[]);',
      '  return { p, d };',
      '}',
    ].join('\n');
    const definition = parseDefinition(code.replace('...[]', 'p'));
    const cells = Object.fromEntries(definition.cells.map((c) => [c.name, c]));
    expect(cells.p!.expr).toEqual({
      call: 'at',
      args: {
        x: { math: '-', args: [{ ref: 'w' }, 1] },
        y: { math: '/', args: [{ math: 'neg', args: [{ math: '+', args: [{ ref: 'w' }, 1] }] }, 2] },
      },
    });
    expect(cells.frame!.expr).toEqual({ op: 'Frame2.new', args: { yAxis: { ref: 'p' } } });
    expect(cells.d).toMatchObject({ type: 'Length', output: true });
    expect((cells.box!.expr as unknown as { args: { points: unknown[] } }).args.points).toHaveLength(3);
    expect(definition.inputs[1]).toEqual({
      name: 'origin',
      type: 'Vec2',
      value: { value: { type: 'Vec2', x: 0, y: 0 } },
    });
    expect(parseDefinition(printDefinition(definition))).toEqual(definition);
  });

  test('errors say what and where', () => {
    expect(parseError(wrap('  const a = nope(1);'))).toMatchObject({ line: 2, column: 13 });
    expect(parseError(wrap('  const a = nope(1);')).message).toMatch(/nope is not a function/);
    expect(parseError(wrap('  const a = new Vec2(1, 2);\n  const b = a.nope();')).message).toMatch(
      /Vec2 has no method nope/,
    );
    expect(parseError(wrap('  const a = new Vec2(1, 2, 3);')).message).toMatch(/Too many arguments/);
    expect(parseError(wrap('  const a = b;')).message).toMatch(/b is not defined here/);
    expect(parseError(wrap('  const a = new Vec2(1, 2).add;')).message).toMatch(/add is a method/);
    expect(parseError(wrap('  const a = 1 +;')).message).toMatch(/Expected an expression/);
    const typed = (returns: string, body: string) => `export function definition()${returns} {\n${body}\n}\n`;
    expect(parseError(typed('', '  const a = 1;\n  return { a };')).message).toMatch(
      /a needs its type in the return type/,
    );
    expect(parseError(typed(': { a: number; b: number }', '  const a = 1;\n  return { a };')).message).toMatch(
      /b is in the return type but not returned/,
    );
    expect(parseDefinition(typed(': { a: Length }', '  const a = 1;\n  return { a };')).cells).toEqual([
      { name: 'a', expr: 1, type: 'Length', output: true },
    ]);
    expect(parseError('const a = 1;').message).toMatch(/Expected "import", "function" or "export function"/);
    const { from, to } = parseError(wrap('  const a = new Vec2(1, 2).nope();'));
    expect(wrap('  const a = new Vec2(1, 2).nope();').slice(from, to)).toBe('nope');
  });
});

test('the printed plate is valid TypeScript against vec2', () => {
  const file = path.join(import.meta.dir, 'printed-plate.ts');
  const code = printDefinition(plate());
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, ...rest) =>
    name === file ? ts.createSourceFile(name, code, language) : read(name, language, ...rest);
  host.fileExists = (
    (exists) => (name: string) =>
      name === file || exists(name)
  )(host.fileExists.bind(host));
  const program = ts.createProgram([file], options, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program, program.getSourceFile(file))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  expect(diagnostics).toEqual([]);
}, 30000);

test('a definition printed with no outputs or inputs still reads back', () => {
  const empty: Definition = { format: 'vec2-definition', version: 4, inputs: [], functions: [], cells: [] };
  expect(parseDefinition(printDefinition(empty))).toEqual(empty);
});

describe('what models write', () => {
  const strict = `function rim(c: Circle2, turn: Coordinate) {
  return c.evaluate(turn * 6.2832 * 3.141592653589793);
}

export function definition(r: Length = 2): { p: Vec2; n: number } {
  const c = new Circle2(new Vec2(lib.cos(1), lib.pow(4, 0.5)), r);
  const p = rim(c, 0.25);
  const n = lib.max(1, r);
  return { p, n };
}`;
  test('helper consts, casts, let and Math read as the strict code', () => {
    const loose = `function rim(c: Circle2, turn: Coordinate): Vec2 {
  const full = 6.2832 as Coordinate;
  const angle = turn * full;
  return c.evaluate(angle * Math.PI);
}

export function definition(r: Length = 2): { p: Vec2; n: number } {
  let c = new Circle2(new Vec2(Math.cos(1), Math.sqrt(4)), r as Length);
  const p = rim(c, 0.25);
  const n = Math.max(1, r) as number;
  return { p, n };
}`;
    expect(parseDefinition(loose)).toEqual(parseDefinition(strict));
    // Printed code stays strict: no consts in functions, no Math.
    expect(printDefinition(parseDefinition(loose))).not.toMatch(/Math\.|\w as [A-Z]|let /);
  });
  test('a model’s spiral (helper consts and casts) evaluates', () => {
    const spiral = `import * as lib from '@dirty-geometry/fn/lib';
import { Circle2, Polyline2, Vec2 } from '@dirty-geometry/vec2/schema/bindings';
import type { Coordinate, Index, Length } from '@dirty-geometry/vec2/schema/bindings';

function spiralPoint(
  i: Index,
  previous: Vec2 | undefined,
  count: Index,
  data: (Length | Coordinate)[]
): Vec2 {
  const radius = data[0] as Length;
  const turns = data[1] as Coordinate;
  const t = i / count;
  const angle = t * turns * 6.2832;
  const r = radius * t;
  return new Vec2(r * lib.cos(angle), r * lib.sin(angle));
}

export function definition(
  radius: Length = 3,
  turns: Coordinate = 5,
  segments: Index = 100,
): { circle: Circle2; spiral: Polyline2; length: number } {
  const circle = new Circle2(new Vec2(0, 0), radius);
  const points = lib.generate(segments, spiralPoint, undefined, [radius, turns]);
  const spiral = new Polyline2(points);
  const length = spiral.length();
  return { circle, spiral, length };
}`;
    const definition = parseDefinition(spiral);
    const evaluation = evaluate(definition);
    expect([...evaluation.cells.values()].filter((r) => 'error' in r)).toEqual([]);
    // Its parameter types are ones the link can pack: no `| undefined`, one number type.
    expect(definition.functions[0]!.params.map((p) => p.type)).toEqual(['Index', 'Vec2', 'Index', 'Coordinate[]']);
    const presets = choosePresets(definition, {}, createDefinitionSchema());
    expect(() => encodeAppState({ definition, options: {}, presets })).not.toThrow();
    expect(evaluation.outputs.length as number).toBeGreaterThan(10);
  });
  test('a local that shadows, and a Math member that is not there, are errors', () => {
    expect(parseError(`function f(a: Coordinate) { const a = 1; return a; }\n${wrap('')}`).message).toContain(
      'a is already defined in f',
    );
    expect(parseError(wrap('  const h = Math.hypot(1, 2);')).message).toContain('Math.hypot is not available');
  });
});
