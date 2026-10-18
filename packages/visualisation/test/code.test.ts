import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import ts from 'typescript';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { fromV3 } from '@dirty-geometry/vec2/recording/migrate';
import { CodeError, parseDefinition } from '../src/playground/model/parse';
import { printDefinition } from '../src/playground/model/print';
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
    expect(code).toContain("import { Boolean2, Circle2, Polygon2, Vec2 } from '@dirty-geometry/vec2/schema/bindings';");
    expect(code).toContain(
      'export function definition(\n  width: Coordinate = 6,\n  height: Coordinate = 4,\n  holeRadius: Length = 1,\n',
    );
    expect(code).toContain(
      '  const circle2 = new Circle2(new Vec2(width, 0).scale(holeX).add(new Vec2(0, height).scale(0.5)), holeRadius);',
    );
    expect(code).toContain('  const hole = new Polygon2([\n    circle2.evaluate(0),\n');
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
      'export function definition(w: Coordinate = 2, origin: Vec2 = value({ type: "Vec2", x: 0, y: 0 })) {',
      '  const p = at(w - 1, -(w + 1) / 2);',
      '  const frame = new Frame2(undefined, undefined, p);',
      '  const d: Length = p.distance(origin) * -1.5;',
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
