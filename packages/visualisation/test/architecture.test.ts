import { expect, test } from 'bun:test';
import { buildImportGraph, findCycles, relativeModule } from '../../../scripts/import-graph';

const SRC = 'packages/visualisation/src';

/** Known `geometry/` → `demos/` imports; shrink-only. */
const ALLOWED_GEOMETRY_TO_DEMOS: string[] = [];

const graph = buildImportGraph([SRC]);
const local = (file: string) => relativeModule(SRC, file);

test('the geometry display layer does not import demos', () => {
  const violations: string[] = [];
  for (const [file, targets] of graph) {
    if (!local(file).startsWith('geometry/')) continue;
    for (const target of targets) {
      if (local(target).startsWith('demos/')) violations.push(`${local(file)} -> ${local(target)}`);
    }
  }
  expect(violations.sort()).toEqual(ALLOWED_GEOMETRY_TO_DEMOS);
});

test('visualisation and graph have no import cycles', () => {
  const ownCycles = (dir: string) =>
    findCycles(buildImportGraph([dir])).filter((cycle) => cycle.some((file) => !relativeModule(dir, file).startsWith('..')));
  expect(ownCycles(SRC)).toEqual([]);
  expect(ownCycles('packages/graph/src')).toEqual([]);
});
