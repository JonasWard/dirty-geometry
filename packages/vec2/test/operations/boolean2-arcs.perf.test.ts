import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../src/core/vec2';
import type { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Boolean2 } from '../../src/operations/boolean2';
import { flower, roundedRectangle } from '../../examples/arc-shapes';

const runPerf = process.env.PERF === '1';

/** A k × k grid of overlapping flowers and rounded blocks: every shape crosses its neighbours. */
function grid(k: number): ArcPolygon2[] {
  const shapes: ArcPolygon2[] = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      shapes.push(
        (i + j) % 2
          ? roundedRectangle(i * 1.6, j * 1.6, 2, 2, 0.4)
          : flower(new Vec2(i * 1.6 + 1, j * 1.6 + 1), 6, 1.1, 0.3),
      );
    }
  }
  return shapes;
}

function timeMs(run: () => unknown, reps: number): number {
  run();
  const start = performance.now();
  for (let i = 0; i < reps; i++) run();
  return (performance.now() - start) / reps;
}

describe.skipIf(!runPerf)('Boolean2 arcs performance (PERF=1)', () => {
  test('union of a grid of curved shapes: exact vs approximate', () => {
    const rows: string[] = [];
    let largest = 0;
    for (const k of [4, 8, 16, 23]) {
      const shapes = grid(k);
      const segments = shapes.reduce((sum, shape) => sum + shape.segmentCount(), 0);
      const exact = timeMs(() => Boolean2.union(shapes), 3);
      const approximate = timeMs(
        () => Boolean2.union(shapes, { arcs: { mode: 'approximate', chordTolerance: 1e-3 } }),
        1,
      );
      if (k === 16) largest = exact;
      rows.push(
        `${String(k * k).padStart(4)} shapes ${String(segments).padStart(5)} segments  exact ${exact.toFixed(1).padStart(7)} ms  approximate 1e-3 ${approximate.toFixed(1).padStart(7)} ms`,
      );
    }
    console.log(rows.join('\n'));
    // Loose: a return to quadratic classification took about a second here.
    expect(largest).toBeLessThan(300);
  }, 120_000);
});
