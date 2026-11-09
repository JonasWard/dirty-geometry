import { describe, expect, test } from 'bun:test';
import { mulberry32 } from '../../examples/random';
import { Vec2 } from '../../src/core/vec2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Minkowski2 } from '../../src/operations/minkowski2';

const runPerf = process.env.PERF === '1';

/** A star-shaped loop of `count` vertices at random radii. */
function star(seed: number, count: number, scale = 1): Polygon2 {
  const random = mulberry32(seed);
  return new Polygon2(
    Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      const r = scale * (0.5 + random() * 1.5);
      return new Vec2(r * Math.cos(angle), r * Math.sin(angle));
    }),
  );
}

/** A comb of `teeth` teeth, each one wide and three high. */
function comb(teeth: number): Polygon2 {
  const vertices = [new Vec2(0, 0), new Vec2(2 * teeth - 1, 0)];
  for (let i = teeth - 1; i >= 0; i--) {
    vertices.push(new Vec2(2 * i + 1, 3), new Vec2(2 * i, 3));
    if (i > 0) vertices.push(new Vec2(2 * i, 1), new Vec2(2 * i - 1, 1));
  }
  return new Polygon2(vertices);
}

function timeMs(run: () => unknown, reps: number): number {
  run();
  const start = performance.now();
  for (let i = 0; i < reps; i++) run();
  return (performance.now() - start) / reps;
}

describe.skipIf(!runPerf)('Minkowski2 performance (PERF=1)', () => {
  test('sum of stars, combs and a disc', () => {
    const rows: string[] = [];
    const budgets: [string, number, number][] = [];
    const time = (name: string, run: () => unknown, budget: number) => {
      const ms = timeMs(run, 3);
      rows.push(`${name.padEnd(28)} ${ms.toFixed(1).padStart(8)} ms`);
      budgets.push([name, ms, budget]);
    };

    time('star 50 ⊕ star 20', () => Minkowski2.sum([star(1, 50, 5)], [star(2, 20)]), 500);
    time('star 200 ⊕ star 20', () => Minkowski2.sum([star(3, 200, 5)], [star(4, 20)]), 1000);
    time('comb 10 ⊕ comb 5', () => Minkowski2.sum([comb(10)], [comb(5)]), 1000);
    time('sumDisc of a 200-gon star', () => Minkowski2.sumDisc([star(5, 200, 5)], 0.3), 500);
    console.log(rows.join('\n'));

    for (const [name, ms, budget] of budgets) expect(ms, name).toBeLessThan(budget);
  });
});
