import { expect, test } from 'bun:test';
import { buildImportGraph, relativeModule } from '../../../scripts/import-graph';

// Bare packages (densing, and sucrase, loaded lazily by run.ts) are not followed by the import graph.
test('vec2-dense imports only itself and vec2', () => {
  const outside: string[] = [];
  for (const [file, targets] of buildImportGraph(['packages/vec2-dense/src'])) {
    if (!relativeModule('packages/vec2-dense', file).startsWith('src/')) continue;
    for (const target of targets) {
      const inDense = !relativeModule('packages/vec2-dense', target).startsWith('..');
      const inVec2 = !relativeModule('packages/vec2', target).startsWith('..');
      if (!inDense && !inVec2) outside.push(`${relativeModule('packages/vec2-dense', file)} -> ${target}`);
    }
  }
  expect(outside).toEqual([]);
});
