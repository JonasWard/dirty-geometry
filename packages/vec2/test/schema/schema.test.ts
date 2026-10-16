import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderSchemaFiles, schemaFiles } from '../../../../scripts/vec2-schema';
import { classes, functions } from '../../schema/bindings';
import type { Vec2Schema } from '../../schema/types';
import schemaJson from '../../schema/vec2.schema.json';

const schema = schemaJson as unknown as Vec2Schema;

describe('vec2 schema', () => {
  test('the committed schema, bindings and ids match the source (run `bun run schema`)', async () => {
    const rendered = await renderSchemaFiles();
    for (const key of Object.keys(schemaFiles) as (keyof typeof schemaFiles)[]) {
      expect(readFileSync(schemaFiles[key], 'utf8')).toBe(rendered[key]);
    }
  }, 60_000);

  test('every recordable operation resolves to a runtime value', () => {
    const missing: string[] = [];
    for (const [id, op] of Object.entries(schema.operations)) {
      if (!op.recordable) continue;
      if (op.kind === 'function') {
        if (typeof (functions as Record<string, unknown>)[id] !== 'function') missing.push(id);
        continue;
      }
      const owner = (classes as Record<string, any>)[op.owner!];
      if (!owner) {
        missing.push(id);
      } else if (op.kind === 'constructor') {
        if (typeof owner !== 'function') missing.push(id);
      } else if (op.kind === 'static') {
        if (typeof owner[op.member] !== 'function') missing.push(id);
      } else if (op.kind === 'constant') {
        if (owner[op.member] === undefined) missing.push(id);
      } else if (op.kind === 'method') {
        if (typeof owner.prototype[op.member] !== 'function') missing.push(id);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every class with a static type tag is listed under that tag', () => {
    for (const [name, value] of Object.entries(classes)) {
      const tag = (value as { type?: unknown }).type;
      if (typeof tag === 'string') expect(schema.classes[name]?.typeTag).toBe(tag);
    }
  });

  test('callbacks, generators and policy exclusions are not recordable, with a reason', () => {
    expect(schema.operations['GridCell2Collection#filter']?.recordable).toBe(false);
    expect(schema.operations['TriMesh2#toJson']?.reason).toContain('policy');
    expect(schema.operations['Vec2#add']?.recordable).toBe(true);
    for (const op of Object.values(schema.operations)) {
      if (!op.recordable) expect(op.reason).toBeTruthy();
    }
  });
});
