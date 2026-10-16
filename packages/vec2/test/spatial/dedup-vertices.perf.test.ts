import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../src/core/epsilon';
import { Vec2 } from '../../src/core/vec2';
import { dedupVertices } from '../../src/spatial/dedup-vertices';

function gridVertices(count: number): Vec2[] {
  const side = Math.ceil(Math.sqrt(count));
  const vertices: Vec2[] = [];

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (vertices.length >= count) break;
      vertices.push(new Vec2(x, y));
    }
  }

  return vertices;
}

function duplicateHeavyVertices(count: number): Vec2[] {
  const vertices: Vec2[] = [];

  for (let i = 0; i < count; i++) {
    const x = i % 1000;
    const y = Math.floor(i / 1000);
    vertices.push(new Vec2(x, y), new Vec2(x + 1e-7, y));
  }

  return vertices.slice(0, count);
}

function medianMs(run: () => void, iterations = 5): number {
  for (let i = 0; i < 3; i++) run();

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }

  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

describe.skipIf(process.env.PERF !== '1')('dedupVertices performance', () => {
  test('10k distinct grid vertices stay within budget', () => {
    const input = gridVertices(10_000);
    const ms = medianMs(() => dedupVertices(input, Epsilon.preferIn, 1));

    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);
    expect(vertices).toHaveLength(10_000);
    expect(remap).toHaveLength(10_000);
    expect(ms).toBeLessThan(250);
  });

  test('10k duplicate-heavy vertices stay within budget', () => {
    const input = duplicateHeavyVertices(10_000);
    const ms = medianMs(() => dedupVertices(input, Epsilon.preferIn, 1));

    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);
    expect(vertices).toHaveLength(5_000);
    expect(remap).toHaveLength(10_000);
    expect(ms).toBeLessThan(250);
  });

  test.skipIf(process.env.PERF !== '1')('reports extended benchmarks', () => {
    const cases = [
      { name: '50k distinct', input: gridVertices(50_000), expected: 50_000 },
      { name: '50k duplicate-heavy', input: duplicateHeavyVertices(50_000), expected: 25_000 },
    ] as const;

    for (const { name, input, expected } of cases) {
      const ms = medianMs(() => dedupVertices(input, Epsilon.preferIn, 1), 7);
      const { vertices } = dedupVertices(input, Epsilon.preferIn, 1);

      expect(vertices).toHaveLength(expected);
      console.log(`[dedupVertices] ${name}: ${ms.toFixed(1)}ms median`);
    }
  });
});
