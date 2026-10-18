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

  test('a static and an instance member with the same name are both kept', () => {
    for (const id of ['Epsilon.sq', 'Epsilon.value', 'GridCell2Collection.xor', 'Polygon2.signedArea']) {
      expect(find(id, true)).toBeDefined();
      expect(find(id, false)).toBeDefined();
    }
  });

  test('members carry their static flag, semantic number types and schema path', () => {
    expect(find('Vec2.add', false)?.params).toEqual([['other', 'Vec2']]);
    expect(find('Vec2.add', false)?.path).toEqual(['core', 'vec2', 'Vec2', '#add']);
    expect(find('Interval2.infinite', true)?.value).toBe(true);
    expect(find('Line2.evaluate', false)?.params).toEqual([['t', 'Parameter']]);
    expect(find('Circle2.new', true)?.params).toEqual([
      ['center', 'Vec2'],
      ['radius', 'Length'],
    ]);
    expect(find('ConstrainedDelaunay.triangulate', true)).toBeDefined();
    expect(find('ConstrainedDelaunay.new', true)).toBeUndefined();
    expect(find('helpers.convexHullLoop', true)?.path.slice(0, 2)).toEqual(['operations', 'helpers']);
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
