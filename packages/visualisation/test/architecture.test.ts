import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildImportGraph, findCycles, relativeModule, repoRoot } from '../../../scripts/import-graph';

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

test('the metadata entry point loads no React or three.js', () => {
  const transpiler = new Bun.Transpiler({ loader: 'tsx' });
  const seen = new Set<string>();
  const external: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { path: specifier } of transpiler.scanImports(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        const base = path.resolve(path.dirname(file), specifier);
        visit(['.ts', '.tsx'].map((ext) => base + ext).find((candidate) => existsSync(candidate))!);
      } else {
        external.push(specifier);
      }
    }
  };
  visit(path.join(repoRoot, SRC, 'meta.ts'));
  expect(external.filter((specifier) => /^(react|three|@react-three)/.test(specifier))).toEqual([]);
});

