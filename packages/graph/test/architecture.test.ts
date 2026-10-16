import { expect, test } from 'bun:test';
import { buildImportGraph, relativeModule } from '../../../scripts/import-graph';

const SRC = 'packages/graph/src';
/** The only module allowed to pull in vec2 geometry classes and io. */
const GEOMETRY_PAYLOADS = 'undirected-graph/geometry-edge-data';

test('the graph core imports nothing from vec2 but Vec2 itself', () => {
  const graph = buildImportGraph([SRC]);
  const violations: string[] = [];
  for (const [file, targets] of graph) {
    const from = relativeModule(SRC, file);
    if (from.startsWith('..') || from === GEOMETRY_PAYLOADS) continue;
    for (const target of targets) {
      const to = relativeModule('packages/vec2/src', target);
      if (!to.startsWith('..') && to !== 'core/vec2') violations.push(`${from} -> vec2/${to}`);
    }
  }
  expect(violations).toEqual([]);
});

test('graph examples only use graph src and vec2, never other packages or the site', () => {
  const graph = buildImportGraph(['packages/graph/examples']);
  const violations: string[] = [];
  for (const [file, targets] of graph) {
    for (const target of targets) {
      const inGraph = !relativeModule('packages/graph', target).startsWith('..');
      const inVec2 = !relativeModule('packages/vec2/src', target).startsWith('..');
      if (!inGraph && !inVec2) violations.push(`${relativeModule('packages/graph', file)} -> ${target}`);
    }
  }
  expect(violations).toEqual([]);
});
