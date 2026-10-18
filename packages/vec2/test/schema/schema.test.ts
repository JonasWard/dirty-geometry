import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateSchema, renderSchemaFiles, schemaFiles } from '../../../../scripts/vec2-schema';
import { classes, helpers } from '../../schema/bindings';
import { SKIP_CLASSES } from '../../schema/policy';
import { classJson, NUMBER_TYPES, operations, types } from '../../schema/schema';

const find = (id: string, isStatic: boolean) => operations.find((op) => op.id === id && op.static === isStatic);

describe('vec2 schema', () => {
  test('the committed schema, dense schema and bindings match the source (run `bun run schema`)', async () => {
    const rendered = await renderSchemaFiles();
    for (const key of Object.keys(schemaFiles) as (keyof typeof schemaFiles)[]) {
      expect(readFileSync(schemaFiles[key], 'utf8')).toBe(rendered[key]);
    }
  }, 60_000);

  test('every operation resolves to a runtime value', () => {
    const missing = operations.filter((op) => {
      const [owner, member] = op.id.split('.') as [string, string];
      if (owner === 'helpers') return typeof (helpers as Record<string, unknown>)[member] !== 'function';
      const cls = (classes as Record<string, any>)[owner];
      if (member === 'new') return typeof cls !== 'function';
      return !(member in (op.static ? cls : cls.prototype)) && !op.value;
    });
    expect(missing.map((op) => op.id)).toEqual([]);
  });

  test('static values are constants, not operations; each member name is static or instance, never both', () => {
    for (const id of ['Epsilon.preferIn', 'Interval2.infinite', 'Interval2.unit', 'Grid2.minIndex', 'Axis.limits']) {
      expect(operations.find((op) => op.id === id)).toBeUndefined();
    }
    expect(find('Epsilon.sq', false)).toBeDefined(); // the instance getter stays
    expect(find('Epsilon.sq', true)).toBeUndefined();
    expect(find('GridCell2Collection.toggle', false)).toBeDefined();
    expect(find('GridCell2Collection.xor', true)).toBeDefined();
    expect(find('Polygon2.computeSignedArea', true)).toBeDefined();
    expect(new Set(operations.map((op) => op.id)).size).toBe(operations.length);
  });

  test('private members are never in the schema', async () => {
    const { schema, dense } = await renderSchemaFiles();
    for (const id of ['GridCell2Collection.cells', 'GridCell2Collection.hashes', 'GridCell2Collection.fromHashSet']) {
      expect(operations.find((op) => op.id === id)).toBeUndefined();
    }
    for (const text of [schema, dense]) expect(text).not.toMatch(/"(fromHashSet|hashes|_\w+|#\w+)"/);
  }, 60_000);

  test('keys are plain names: no file level, no markers, no joined paths', async () => {
    const { schema } = await renderSchemaFiles();
    const keys = [...schema.matchAll(/"([^"]+)":/g)].map((m) => m[1]!);
    expect(keys.filter((key) => /[#$/]/.test(key))).toEqual([]);
    expect(operations.filter((op) => op.path.some((part) => /[#$/]/.test(part))).map((op) => op.id)).toEqual([]);
    expect(find('Vec2.add', false)?.path).toEqual(['core', 'Vec2', 'add']);
  }, 60_000);

  test('members carry their static flag, semantic number types and schema path', () => {
    expect(find('Vec2.add', false)?.params).toEqual([['other', 'Vec2']]);
    expect(find('Vec2.new', true)?.path).toEqual(['core', 'Vec2', 'new']);
    expect(find('Line2.evaluate', false)?.params).toEqual([['t', 'Parameter']]);
    expect(find('Circle2.new', true)?.params).toEqual([
      ['center', 'Vec2'],
      ['radius', 'Length'],
    ]);
    expect(find('ConstrainedDelaunay.triangulate', true)).toBeDefined();
    expect(find('ConstrainedDelaunay.new', true)).toBeUndefined();
    expect(find('helpers.convexHullLoop', true)?.path).toEqual(['operations', 'helpers', 'cdt', 'convexHullLoop']);
    expect(NUMBER_TYPES).toEqual(['Coordinate', 'Length', 'Radians', 'Parameter', 'Integer', 'Index', 'Tolerance']);
  });

  test('JSON types are named, untagged and listed in MathJson; toJson returns them', async () => {
    expect(types.Line2Json).toEqual({ from: 'Vec2Json', to: 'Vec2Json' });
    for (const [name, value] of Object.entries(classes)) {
      if (typeof (value as { prototype?: { toJson?: unknown } }).prototype?.toJson !== 'function') continue;
      expect((types.MathJson as { or: string[] }).or).toContain(classJson[name]!);
      expect(JSON.stringify(types[classJson[name]!])).not.toContain('"type":{"enum"');
    }
    const { schema } = await renderSchemaFiles();
    expect(schema).toContain('"toJson": { "returns": "Vec2Json" }');
    expect(schema).toMatch(/"filter": null/);
    for (const name of SKIP_CLASSES) expect(classJson[name]).toBeUndefined();
    expect(operations.some((op) => SKIP_CLASSES.has(op.id.split('.')[0]!))).toBe(false);
  }, 60_000);

  test('a bare `number` in a parameter fails generation', () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'vec2-src-'));
    try {
      cpSync(path.join(import.meta.dir, '../../src'), copy, { recursive: true });
      const file = path.join(copy, 'core/vec2.ts');
      writeFileSync(file, readFileSync(file, 'utf8').replace('scale(factor: Coordinate)', 'scale(factor: number)'));
      expect(() => generateSchema(copy)).toThrow(/Bare `number`.*Vec2\.scale\(factor\)/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }, 60_000);
});
