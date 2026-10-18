import { describe, expect, test } from 'bun:test';
import { buildImportGraph, findCycles, relativeModule } from '../../../../scripts/import-graph';
import { vec2Layer } from './layers';

const SRC = 'packages/vec2/src';
const EXAMPLES = 'packages/vec2/examples';

/** Known cycles; remove entries as they are broken. The test fails on new cycles and on stale entries. */
const ALLOWED_CYCLES: string[][] = [
  // Grid regions convert into each other (bounding rectangles, edges, outlines); kept as one unit.
  ['grid/regions/grid-line2', 'grid/regions/grid-polygon2', 'grid/regions/grid-rectangle2'],
];

/** Known imports that point to a higher layer; same shrink-only rule. */
const ALLOWED_LAYER_VIOLATIONS: string[] = [];

const graph = buildImportGraph([SRC]);

describe('vec2 import architecture', () => {
  test('has no import cycles beyond the allowlist', () => {
    const cycles = findCycles(graph).map((cycle) => cycle.map((file) => relativeModule(SRC, file)).sort());
    const key = (cycle: readonly string[]) => [...cycle].sort().join(' ↔ ');
    expect(cycles.map(key).sort()).toEqual(ALLOWED_CYCLES.map(key).sort());
  });

  test('only imports from the same or a lower layer', () => {
    const violations: string[] = [];
    for (const [file, targets] of graph) {
      const from = relativeModule(SRC, file);
      for (const target of targets) {
        const to = relativeModule(SRC, target);
        if (vec2Layer(to) > vec2Layer(from)) violations.push(`${from} -> ${to}`);
      }
    }
    expect(violations.sort()).toEqual([...ALLOWED_LAYER_VIOLATIONS].sort());
  });

  test('src never imports from examples or other packages (recording may read the generated schema)', () => {
    const outside: string[] = [];
    for (const [file, targets] of graph) {
      const from = relativeModule(SRC, file);
      for (const target of targets) {
        const to = relativeModule(SRC, target);
        const schemaRead =
          (from.startsWith('recording/') && to.startsWith('../schema/')) || from.startsWith('../schema/');
        if (to.startsWith('..') && !schemaRead) {
          outside.push(`${relativeModule(SRC, file)} -> ${relativeModule(EXAMPLES, target)}`);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  test('nothing outside recording/ imports the recording layer', () => {
    const users: string[] = [];
    for (const [file, targets] of graph) {
      const from = relativeModule(SRC, file);
      if (from.startsWith('recording/')) continue;
      for (const target of targets) {
        if (relativeModule(SRC, target).startsWith('recording/'))
          users.push(`${from} -> ${relativeModule(SRC, target)}`);
      }
    }
    expect(users).toEqual([]);
  });

  test('the schema and dense packing use only the history types from recording/, never the recorder or replay', () => {
    const SCHEMA = 'packages/vec2/schema';
    const uses: string[] = [];
    for (const [file, targets] of buildImportGraph([SCHEMA])) {
      for (const target of targets) {
        const to = relativeModule(SRC, target);
        if (to.startsWith('recording/')) uses.push(`${relativeModule(SCHEMA, file)} -> ${to}`);
      }
    }
    expect(uses.filter((use) => !use.endsWith('-> recording/definition'))).toEqual([]);
    expect(uses).toContain('dense/definition -> recording/definition');
  });

  test('examples only import vec2 itself', () => {
    const outside: string[] = [];
    for (const [file, targets] of buildImportGraph([EXAMPLES])) {
      for (const target of targets) {
        const fromPackage = relativeModule('packages/vec2', target);
        if (fromPackage.startsWith('..')) outside.push(`${relativeModule(EXAMPLES, file)} -> ${fromPackage}`);
      }
    }
    expect(outside).toEqual([]);
  });
});
