#!/usr/bin/env bun
/**
 * Runtime import graph of the workspace packages.
 *
 * Uses Bun's transpiler, which drops type-only imports, so the graph only contains edges that exist
 * at runtime. Used by the architecture tests to forbid new import cycles and layer violations.
 *
 *   bun scripts/import-graph.ts packages/vec2/src   # print cycles
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const repoRoot = path.resolve(import.meta.dir, '..');

const packageSources: Record<string, string> = {
  '@dirty-geometry/vec2/examples/': path.join(repoRoot, 'packages/vec2/examples/'),
  '@dirty-geometry/vec2/': path.join(repoRoot, 'packages/vec2/src/'),
  '@dirty-geometry/graph/': path.join(repoRoot, 'packages/graph/src/'),
  '@dirty-geometry/visualisation/': path.join(repoRoot, 'packages/visualisation/src/'),
};

const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Graph keyed by absolute file path; values are the absolute paths it imports at runtime. */
export type ImportGraph = Map<string, Set<string>>;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : listSourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
  });
}

function resolveFile(base: string): string | null {
  if (/\.tsx?$/.test(base) && existsSync(base)) return base;
  for (const ext of extensions) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

function resolveSpecifier(from: string, specifier: string): string | null {
  if (specifier.startsWith('.')) return resolveFile(path.resolve(path.dirname(from), specifier));
  for (const [prefix, dir] of Object.entries(packageSources)) {
    if (specifier.startsWith(prefix)) return resolveFile(path.join(dir, specifier.slice(prefix.length)));
  }
  const bare = specifier.replace(/\/$/, '');
  if (bare === '@dirty-geometry/graph') return resolveFile(path.join(repoRoot, 'packages/graph/src/index'));
  if (bare === '@dirty-geometry/visualisation') {
    return resolveFile(path.join(repoRoot, 'packages/visualisation/src/index'));
  }
  return null;
}

/** Builds the runtime import graph of every `.ts`/`.tsx` file under `dirs`, following edges into other packages. */
export function buildImportGraph(dirs: readonly string[]): ImportGraph {
  const graph: ImportGraph = new Map();
  const queue = dirs.flatMap((dir) => listSourceFiles(path.resolve(repoRoot, dir)));
  const tsTranspiler = new Bun.Transpiler({ loader: 'ts' });
  const tsxTranspiler = new Bun.Transpiler({ loader: 'tsx' });

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (graph.has(file)) continue;
    const transpiler = file.endsWith('.tsx') ? tsxTranspiler : tsTranspiler;
    const edges = new Set<string>();
    for (const entry of transpiler.scanImports(readFileSync(file, 'utf8'))) {
      if (entry.kind === 'dynamic-import') continue;
      const target = resolveSpecifier(file, entry.path);
      if (target) {
        edges.add(target);
        if (!graph.has(target)) queue.push(target);
      }
    }
    graph.set(file, edges);
  }
  return graph;
}

/** Strongly connected components with more than one file (or a self import), via Tarjan's algorithm. */
export function findCycles(graph: ImportGraph): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const strongConnect = (node: string) => {
    indices.set(node, index);
    lowlink.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        strongConnect(next);
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!));
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, indices.get(next)!));
      }
    }

    if (lowlink.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || graph.get(node)?.has(node)) cycles.push(component.sort());
    }
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) strongConnect(node);
  }
  return cycles;
}

/** Path relative to `root`, without extension, e.g. `core/vec2`. */
export function relativeModule(root: string, file: string): string {
  return path.relative(path.resolve(repoRoot, root), file).replace(/\.tsx?$/, '').split(path.sep).join('/');
}

if (import.meta.main) {
  const dirs = process.argv.slice(2);
  const graph = buildImportGraph(dirs.length > 0 ? dirs : ['packages']);
  const cycles = findCycles(graph);
  for (const cycle of cycles) {
    console.log(cycle.map((file) => path.relative(repoRoot, file)).join('\n  ↔ '), '\n');
  }
  console.log(`${graph.size} files, ${cycles.length} import cycle(s)`);
  process.exit(cycles.length > 0 ? 1 : 0);
}
