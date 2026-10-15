import { describe, expect, test } from 'bun:test';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { buildingYardMesh, hPlateMesh, lWingMesh, perfPlateMesh, swissCheeseMesh } from '@dirty-geometry/vec2/examples/tri-mesh2/meshes';
import { sampleGridPoints } from '../src/demos/tri-mesh2/scenarios';

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

type MeshPerfCase = {
  name: string;
  mesh: ReturnType<typeof swissCheeseMesh>;
  points: Vec2[];
  batchBudgetMs: number;
};

const meshPerfCases: MeshPerfCase[] = [
  {
    name: 'swiss cheese',
    mesh: swissCheeseMesh(),
    points: sampleGridPoints(-0.2, 10.2, 0.28),
    batchBudgetMs: 40,
  },
  {
    name: 'L-wing',
    mesh: lWingMesh(),
    points: sampleGridPoints(-0.4, 9.4, 0.55),
    batchBudgetMs: 15,
  },
  {
    name: 'building yard',
    mesh: buildingYardMesh(),
    points: sampleGridPoints(-0.6, 18.6, 0.85),
    batchBudgetMs: 25,
  },
  {
    name: 'H-plate',
    mesh: hPlateMesh(),
    points: sampleGridPoints(-0.5, 12.5, 0.65),
    batchBudgetMs: 25,
  },
  {
    name: 'perf plate 30×30 / 49 holes',
    mesh: perfPlateMesh(30, 4),
    points: sampleGridPoints(0, 30, 0.5),
    batchBudgetMs: 100,
  },
];

describe.skipIf(process.env.PERF !== '1')('TriMesh2 containsPoint performance', () => {
  for (const { name, mesh, points, batchBudgetMs } of meshPerfCases) {
    test(`${name} single query stays within budget`, () => {
      const ms = medianMs(() => mesh.containsPoint(new Vec2(5, 5)));

      expect(mesh.boundaryLoops().length).toBeGreaterThan(0);
      expect(ms).toBeLessThan(5);
    });

    test(`${name} visualization-scale grid stays within budget`, () => {
      const ms = medianMs(() => {
        for (const point of points) {
          mesh.containsPoint(point);
        }
      });

      expect(points.length).toBeGreaterThan(100);
      expect(ms).toBeLessThan(batchBudgetMs);
    });
  }

  test('boundary loop extraction stays within budget on complex meshes', () => {
    const mesh = swissCheeseMesh();
    const ms = medianMs(() => mesh.boundaryLoops());

    expect(mesh.boundaryLoops().length).toBeGreaterThan(1);
    expect(ms).toBeLessThan(5);
  });

  test.skipIf(process.env.PERF !== '1')('reports extended containsPoint benchmarks', () => {
    for (const { name, mesh, points } of meshPerfCases) {
      const loopsMs = medianMs(() => mesh.boundaryLoops(), 7);
      const singleMs = medianMs(() => mesh.containsPoint(new Vec2(5, 5)), 7);
      const batchMs = medianMs(() => {
        for (const point of points) {
          mesh.containsPoint(point);
        }
      }, 7);

      expect(mesh.boundaryLoops().length).toBeGreaterThan(0);
      console.log(
        `[TriMesh2.containsPoint] ${name}: loops=${loopsMs.toFixed(2)}ms single=${singleMs.toFixed(2)}ms batch(${points.length})=${batchMs.toFixed(1)}ms`,
      );
    }
  });
});

describe.skipIf(process.env.PERF !== '1')('TriMesh2 containsPoint performance · slack variants', () => {
  test('preferIn and preferOut batch queries stay within budget', () => {
    const mesh = hPlateMesh();
    const points = sampleGridPoints(-0.5, 12.5, 0.65);

    const preferInMs = medianMs(() => {
      for (const point of points) {
        mesh.containsPoint(point, Epsilon.preferIn);
      }
    });
    const preferOutMs = medianMs(() => {
      for (const point of points) {
        mesh.containsPoint(point, Epsilon.preferOut);
      }
    });

    expect(preferInMs).toBeLessThan(30);
    expect(preferOutMs).toBeLessThan(30);
  });
});
