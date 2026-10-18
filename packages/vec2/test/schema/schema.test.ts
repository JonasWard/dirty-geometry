import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderSchemaFiles, schemaFiles } from '../../../../scripts/vec2-schema';
import { classes, helpers } from '../../schema/bindings';
import { SKIP_CLASSES } from '../../schema/policy';
import { classJson, operations } from '../../schema/schema';

const find = (id: string, isStatic: boolean) => operations.find((op) => op.id === id && op.static === isStatic);

describe('vec2 schema', () => {
  test('the committed schema and bindings match the source (run `bun run schema`)', async () => {
    const rendered = await renderSchemaFiles();
    for (const key of Object.keys(schemaFiles) as (keyof typeof schemaFiles)[]) {
      expect(readFileSync(schemaFiles[key], 'utf8')).toBe(rendered[key]);
    }
  }, 60_000);

  test('every operation resolves to a runtime value', () => {
    const missing = operations.filter((op) => {
      const [name, member] = op.id.split('.') as [string, string?];
      if (!member) return typeof (helpers as Record<string, unknown>)[name] !== 'function';
      const owner = (classes as Record<string, any>)[name];
      if (member === 'new') return typeof owner !== 'function';
      return !(member in (op.static ? owner : owner.prototype)) && !op.value;
    });
    expect(missing.map((op) => op.id)).toEqual([]);
  });

  test('a static and an instance member with the same name are both kept', () => {
    for (const id of ['Epsilon.sq', 'Epsilon.value', 'GridCell2Collection.xor', 'Polygon2.signedArea']) {
      expect(find(id, true)).toBeDefined();
      expect(find(id, false)).toBeDefined();
    }
  });

  test('members carry their static flag and roles', () => {
    expect(find('Vec2.add', false)?.params).toEqual([['other', 'Vec2']]);
    expect(find('Interval2.infinite', true)?.value).toBe(true);
    expect(find('Line2.evaluate', false)?.params).toEqual([['t', 'parameter']]);
    expect(find('ConstrainedDelaunay.triangulate', true)).toBeDefined();
    expect(find('ConstrainedDelaunay.new', true)).toBeUndefined();
    expect(find('convexHullLoop', true)).toBeDefined();
  });

  test('unrecordable members are listed as null; excluded classes are absent', async () => {
    const { schema } = await renderSchemaFiles();
    expect(schema).toMatch(/"filter": null/);
    expect(schema).not.toMatch(/"toJson": [^n]/);
    for (const name of SKIP_CLASSES) expect(classJson[name]).toBeUndefined();
    expect(operations.some((op) => SKIP_CLASSES.has(op.id.split('.')[0]!))).toBe(false);
  }, 60_000);

  test('every codec class has a json shape', () => {
    for (const [name, value] of Object.entries(classes)) {
      if (typeof (value as { prototype?: { toJson?: unknown } }).prototype?.toJson === 'function')
        expect(classJson[name]).toBeDefined();
    }
  });
});
