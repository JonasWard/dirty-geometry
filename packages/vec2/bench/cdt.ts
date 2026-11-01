/**
 * CDT benchmark against npm references, with the performance gates from the rework plan.
 *
 *   bun bench/cdt.ts            run, compare with bench/cdt-baseline.json when present
 *   bun bench/cdt.ts --save     run and overwrite bench/cdt-baseline.json
 *   bun bench/cdt.ts --quick    smaller sizes, fewer repeats (smoke run)
 *
 * Times are medians on this machine; ratios and op counts are what the gates check.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Delaunator from 'delaunator';
import { Vec2 } from '../src/core/vec2';
import { ConstrainedDelaunay } from '../src/operations/constrained-delaunay';
import { triangulateConstrained } from '../src/operations/helpers/cdt/triangulate';
import { constraintEdge } from '../src/operations/helpers/constraint-edge';
import { mulberry32 } from '../examples/random';
import { cdt2dAll, constrainautor, delaunator, poly2triRing, type Edge } from './references';

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const baselinePath = new URL('./cdt-baseline.json', import.meta.url).pathname;

type Input = { points: Vec2[]; constraints: Edge[]; contour?: number[] };
type Impl = { name: string; run: (input: Input) => unknown; skip?: (input: Input) => boolean };
type Case = { name: string; n: number; input: Input; impls: string[] };

function randomPoints(count: number, seed: number): Vec2[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => new Vec2(rng() * 1000, rng() * 1000));
}

/** Convex ring of `ring` vertices (constraints) with `inner` random points inside. */
function ringInput(ring: number, inner: number, seed: number): Input {
  const rng = mulberry32(seed);
  const points: Vec2[] = [];
  for (let i = 0; i < ring; i++) {
    const angle = (2 * Math.PI * i) / ring;
    points.push(new Vec2(500 + 400 * Math.cos(angle), 500 + 400 * Math.sin(angle)));
  }
  for (let i = 0; i < inner; i++) {
    const angle = rng() * 2 * Math.PI;
    const radius = 390 * Math.sqrt(rng());
    points.push(new Vec2(500 + radius * Math.cos(angle), 500 + radius * Math.sin(angle)));
  }
  const contour = points.slice(0, ring).map((_, i) => i);
  return { points, constraints: contour.map((i) => [i, (i + 1) % ring]), contour };
}

/** Random points plus long non-crossing constraints: chords of a coarse Delaunay mesh over a subset. */
function chordInput(count: number, chords: number, seed: number): Input {
  const points = randomPoints(count, seed);
  const coarse = points.slice(0, Math.max(3, Math.floor(chords / 2)));
  const coords = new Float64Array(coarse.flatMap((p) => [p.x, p.y]));
  const tri = new Delaunator(coords).triangles;
  const rng = mulberry32(seed + 1);
  const constraints: Edge[] = [];
  const seen = new Set<number>();
  for (let e = 0; e < tri.length && constraints.length < chords; e++) {
    const a = tri[e]!;
    const b = tri[e % 3 === 2 ? e - 2 : e + 1]!;
    const key = Math.min(a, b) * count + Math.max(a, b);
    if (seen.has(key) || rng() < 0.3) continue;
    seen.add(key);
    constraints.push([a, b]);
  }
  // Long chords cross the fine points; drop the fine points lying exactly on a chord (measure zero).
  return { points, constraints };
}

const impls: Record<string, Impl> = {
  'vec2 report': {
    name: 'vec2 report',
    run: ({ points, constraints }) => ConstrainedDelaunay.report(points, constraints),
  },
  'vec2 core': {
    name: 'vec2 core',
    run: ({ points, constraints }) =>
      triangulateConstrained(
        points,
        constraints.map(([a, b]) => constraintEdge(a, b)),
      ),
  },
  delaunator: { name: 'delaunator', run: ({ points }) => delaunator(points, []) },
  constrainautor: { name: 'constrainautor', run: ({ points, constraints }) => constrainautor(points, constraints) },
  cdt2d: { name: 'cdt2d', run: ({ points, constraints }) => cdt2dAll(points, constraints) },
  poly2tri: { name: 'poly2tri', run: ({ points, contour }) => poly2triRing(points, contour!) },
};

const scale = quick ? 0.1 : 1;
const sizes = (list: number[]) => list.map((n) => Math.max(1000, Math.round(n * scale)));

const cases: Case[] = [];
for (const n of sizes([10_000, 100_000])) {
  cases.push({
    name: `random ${n}`,
    n,
    input: { points: randomPoints(n, 1), constraints: [] },
    impls: ['vec2 report', 'vec2 core', 'delaunator', 'constrainautor', 'cdt2d'],
  });
}
for (const n of sizes([25_000, 50_000, 200_000])) {
  cases.push({
    name: `random ${n}`,
    n,
    input: { points: randomPoints(n, 1), constraints: [] },
    impls: ['vec2 report'],
  });
}
for (const ring of sizes([5_000, 10_000, 50_000])) {
  cases.push({
    name: `ring ${ring} + ${ring} pts`,
    n: 2 * ring,
    input: ringInput(ring, ring, 3),
    impls: ['vec2 report', 'vec2 core', 'constrainautor', 'cdt2d', 'poly2tri'],
  });
}
for (const n of sizes([20_000])) {
  cases.push({
    name: `chords ${n / 10} over ${n} pts`,
    n,
    input: chordInput(n, n / 10, 5),
    impls: ['vec2 report', 'constrainautor', 'cdt2d'],
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Median wall time in ms; `null` when the implementation throws. Slow runs get fewer repeats. */
function measure(impl: Impl, input: Input): { ms: number | null; error?: string } {
  try {
    const first = performance.now();
    impl.run(input);
    const once = performance.now() - first;
    const repeats = quick ? 1 : once > 2000 ? 1 : once > 300 ? 3 : 5;
    const times: number[] = [];
    for (let i = 0; i < repeats; i++) {
      const start = performance.now();
      impl.run(input);
      times.push(performance.now() - start);
    }
    return { ms: median(times) };
  } catch (error) {
    return { ms: null, error: String(error).slice(0, 60) };
  }
}

type Results = Record<string, Record<string, number | null>>;
const results: Results = {};
const statsByCase: Record<string, ReturnType<typeof ConstrainedDelaunay.report>['stats']> = {};

for (const c of cases) {
  results[c.name] = {};
  const cells: string[] = [];
  for (const name of c.impls) {
    const { ms, error } = measure(impls[name]!, c.input);
    results[c.name]![name] = ms;
    cells.push(`${name}: ${ms === null ? `throws (${error})` : `${ms.toFixed(1)} ms`}`);
  }
  statsByCase[c.name] = ConstrainedDelaunay.report(c.input.points, c.input.constraints).stats;
  console.log(c.name.padEnd(26), cells.join(' | '));
}

const baseline: Results | null = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
if (args.has('--save')) {
  writeFileSync(baselinePath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nsaved baseline to ${baselinePath}`);
}

// ---- gates ----
type Gate = { name: string; value: string; pass: boolean };
const gates: Gate[] = [];
const time = (name: string, impl: string) => results[name]?.[impl] ?? null;
const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);
const gate = (name: string, value: number | null, limit: number, unit = '×') =>
  gates.push({
    name,
    value: value === null ? 'n/a' : `${value.toFixed(2)}${unit} (≤ ${limit}${unit})`,
    pass: value !== null && value <= limit,
  });

const ringCases = cases.filter((c) => c.name.startsWith('ring'));
const randomCases = cases.filter((c) => c.name.startsWith('random')).sort((a, b) => a.n - b.n);
const bigRandom = randomCases.find((c) => c.impls.includes('delaunator') && c.n >= 100_000 * scale)!;

gate(
  `facade overhead, ${ringCases[0]!.name} (report / core)`,
  ratio(time(ringCases[0]!.name, 'vec2 report'), time(ringCases[0]!.name, 'vec2 core')),
  1.3,
);
gate(
  `${bigRandom.name}: report / delaunator`,
  ratio(time(bigRandom.name, 'vec2 report'), time(bigRandom.name, 'delaunator')),
  3,
);
for (const c of ringCases.slice(1)) {
  gate(`${c.name}: report / constrainautor`, ratio(time(c.name, 'vec2 report'), time(c.name, 'constrainautor')), 1.5);
  for (const other of ['cdt2d', 'poly2tri']) {
    const t = time(c.name, other);
    if (t !== null) gate(`${c.name}: report / ${other}`, ratio(time(c.name, 'vec2 report'), t), 1);
  }
}
for (let i = 1; i < randomCases.length; i++) {
  const [small, large] = [randomCases[i - 1]!, randomCases[i]!];
  const growth = ratio(time(large.name, 'vec2 report'), time(small.name, 'vec2 report'));
  const doublings = Math.log2(large.n / small.n);
  gate(`scaling ${small.n} → ${large.n} (per doubling)`, growth === null ? null : growth ** (1 / doublings), 2.3);
}
const s = statsByCase[bigRandom.name]!;
gate(`${bigRandom.name}: inCircle / n`, s.inCircle / bigRandom.n, 10, '');
gate(`${bigRandom.name}: walkSteps / n`, s.walkSteps / bigRandom.n, 5, '');
gate(
  `${bigRandom.name}: triangles / n`,
  ConstrainedDelaunay.report(bigRandom.input.points, bigRandom.input.constraints).mesh.triangles.length / bigRandom.n,
  2,
  '',
);
gate(
  'guard hits over all cases',
  Object.values(statsByCase).reduce((sum, st) => sum + (st.guardHits ?? 0), 0),
  0,
  '',
);
if (baseline && !args.has('--save')) {
  for (const c of cases) {
    for (const impl of ['vec2 report', 'vec2 core']) {
      const before = baseline[c.name]?.[impl];
      if (before == null || !c.impls.includes(impl)) continue;
      gate(`no regression, ${c.name} ${impl} (now / baseline)`, ratio(time(c.name, impl), before), 1.1);
    }
  }
}

console.log('\nGates');
for (const g of gates) console.log(`${g.pass ? 'PASS' : 'FAIL'}  ${g.name.padEnd(58)} ${g.value}`);
console.log(`\n${gates.filter((g) => g.pass).length}/${gates.length} gates pass`);
