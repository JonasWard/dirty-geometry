import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderSchemaFiles, schemaFiles } from '../../../../scripts/vec2-schema';
import { classes, helpers } from '../../schema/bindings';
import { operationOf, operations, vec2Schema } from '../../schema/operations';
import { policy } from '../../schema/policy';

describe('vec2 schema', () => {
  test('the committed schema, bindings and ids match the source (run `bun run schema`)', async () => {
    const rendered = await renderSchemaFiles();
    for (const key of Object.keys(schemaFiles) as (keyof typeof schemaFiles)[]) {
      expect(readFileSync(schemaFiles[key], 'utf8')).toBe(rendered[key]);
    }
  }, 60_000);

  test('every recordable operation resolves to a runtime value', () => {
    const missing: string[] = [];
    for (const [id, op] of operations) {
      if (!op.recordable) continue;
      if (op.kind === 'function') {
        if (typeof (helpers as Record<string, unknown>)[id] !== 'function') missing.push(id);
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

  test('members are nested under their class, static ones marked', () => {
    expect(vec2Schema.classes.Vec2?.members.add).toMatchObject({ params: [{ name: 'other' }] });
    expect(vec2Schema.classes.Vec2?.members.origin?.static).toBe(true);
    expect(operationOf('Vec2.origin')?.kind).toBe('static');
    expect(operationOf('Vec2#x')?.kind).toBe('field');
    expect(operationOf('DouglasPeucker.defaults')?.kind).toBe('constant');
    expect(operationOf('ConstrainedDelaunay.triangulate')?.kind).toBe('static');
  });

  test('static-only classes have no constructor', () => {
    for (const name of [
      'Boolean2',
      'Contains2',
      'Overlap2',
      'Intersection2',
      'DouglasPeucker',
      'ConstrainedDelaunay',
    ]) {
      expect(vec2Schema.classes[name]?.new).toBeUndefined();
    }
  });

  test('helpers are grouped by module and only live in operations helpers/ folders', () => {
    for (const module of Object.keys(vec2Schema.helpers)) {
      expect(module.startsWith('operations/') && module.split('/').includes('helpers')).toBe(true);
    }
    expect(operationOf('operations/helpers/cdt/hull:convexHullLoop')?.kind).toBe('function');
  });

  test('every class with a static type tag is listed under that tag', () => {
    for (const [name, value] of Object.entries(classes)) {
      const tag = (value as { type?: unknown }).type;
      if (typeof tag === 'string') expect(vec2Schema.classes[name]?.typeTag).toBe(tag);
    }
  });

  test('callbacks, generators and policy exclusions are not recordable, with a reason', () => {
    expect(operationOf('GridCell2Collection#filter')?.recordable).toBe(false);
    expect(operationOf('TriMesh2#toJson')?.reason).toContain('policy');
    expect(operationOf('Vec2#add')?.recordable).toBe(true);
    for (const op of operations.values()) {
      if (!op.recordable) expect(op.reason).toBeTruthy();
    }
  });

  test('every alias points to a recordable operation', () => {
    for (const [from, to] of Object.entries(policy.aliases)) {
      expect(operationOf(from)).toBeUndefined();
      expect(operationOf(to)?.recordable).toBe(true);
    }
  });
});
