import { describe, expect, test } from 'bun:test';
import { Boolean2 } from '@dirty-geometry/vec2/operations/boolean2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  boolean2IntersectPolygonScenarios,
  boolean2IntersectScenarios,
  boolean2ManyIntersectScenarios,
  boolean2ManySubtractScenarios,
  boolean2Scenarios,
  boolean2SubtractPolygonScenarios,
  boolean2SubtractScenarios,
  boolean2UnionScenarios,
  evaluateBooleanScenario,
  pointInsideScenario,
  removedHalfSamplePoint,
} from '../src/demos/boolean2/scenarios';

const xAxisHalfPlane = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));

function squareAt(originX: number, originY: number, size: number): Polygon2 {
  return new Polygon2([
    new Vec2(originX, originY),
    new Vec2(originX + size, originY),
    new Vec2(originX + size, originY + size),
    new Vec2(originX, originY + size),
  ]);
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Polygon2 {
  return new Polygon2([new Vec2(x0, y0), new Vec2(x1, y0), new Vec2(x1, y1), new Vec2(x0, y1)]);
}

const squareHole = new Polygon2([new Vec2(1.5, 1.5), new Vec2(1.5, 2.5), new Vec2(2.5, 2.5), new Vec2(2.5, 1.5)]);

function pointInsideResult(
  polygons: readonly Polygon2[],
  point: Vec2,
  mesh?: ReturnType<typeof Boolean2.union>['triMesh'],
): boolean {
  if (mesh && mesh.triangles.length > 0) {
    return mesh.containsPoint(point, Epsilon.preferIn);
  }

  return Polygon2.isPointInside(polygons, point, Epsilon.preferIn);
}

describe('Boolean2', () => {
  describe('union', () => {
    test('merges overlapping squares into one region', () => {
      const left = squareAt(0, 0, 2);
      const right = squareAt(1, 0, 2);
      const result = Boolean2.union([left, right], { mesh: true });

      expect(result.polygons.length).toBeGreaterThan(0);
      expect(result.triMesh).toBeDefined();
      expect(pointInsideResult(result.polygons, new Vec2(1.5, 1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(0.25, 0.25), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2.75, 0.25), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(5, 5), result.triMesh)).toBe(false);
    });

    test('keeps disjoint squares as separate loops', () => {
      const left = squareAt(0, 0, 1);
      const right = squareAt(3, 0, 1);
      const result = Boolean2.union([left, right]);

      expect(result.polygons.length).toBe(2);
      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5))).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(3.5, 0.5))).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 0.5))).toBe(false);
    });

    test('subtracts clockwise hole loops from filled polygons', () => {
      const outer = squareAt(0, 0, 4);
      const hole = new Polygon2([new Vec2(1.5, 1.5), new Vec2(1.5, 2.5), new Vec2(2.5, 2.5), new Vec2(2.5, 1.5)]);
      const result = Boolean2.union([outer, hole]);

      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5))).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2))).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(3.5, 3.5))).toBe(true);
    });

    test('empty input returns no polygons', () => {
      expect(Boolean2.union([]).polygons).toEqual([]);
    });
  });

  describe('intersect with half-plane', () => {
    test('clips a spanning square to the below-axis half-plane', () => {
      const square = rectangle(0, -1, 2, 1);
      const result = Boolean2.intersect([square], xAxisHalfPlane, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(1, -0.5), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(1, 0.5), result.triMesh)).toBe(false);
      expect(result.triMesh).toBeDefined();
    });

    test('preserves holes when clipping a perforated square', () => {
      const outer = rectangle(0, -2, 4, 4);
      const hole = new Polygon2([new Vec2(1.5, 1.5), new Vec2(1.5, 2.5), new Vec2(2.5, 2.5), new Vec2(2.5, 1.5)]);
      const result = Boolean2.intersect([outer, hole], xAxisHalfPlane, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(0.5, -1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(0.5, 2), result.triMesh)).toBe(false);
    });
  });

  describe('subtract half-plane', () => {
    test('removes the below-axis half-plane from a square', () => {
      const square = squareAt(0, 0, 2);
      const result = Boolean2.subtract([square], xAxisHalfPlane, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(1, 1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(1, 0.25), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(1, -0.25), result.triMesh)).toBe(false);
    });

    test('returns a filtered mesh when mesh option is set', () => {
      const square = squareAt(0, 0, 2);
      const result = Boolean2.subtract([square], xAxisHalfPlane, { mesh: true });

      expect(result.triMesh?.triangles.length).toBeGreaterThan(0);
      expect(pointInsideResult(result.polygons, new Vec2(1, 1), result.triMesh)).toBe(true);
    });

    test('preserves holes after subtracting a half-plane', () => {
      const outer = squareAt(0, 0, 4);
      const hole = new Polygon2([new Vec2(1.5, 1.5), new Vec2(1.5, 2.5), new Vec2(2.5, 2.5), new Vec2(2.5, 1.5)]);
      const result = Boolean2.subtract([outer, hole], xAxisHalfPlane, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(0.5, 3.5), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2), result.triMesh)).toBe(false);
    });
  });

  describe('intersect polygon', () => {
    test('keeps overlap of two squares', () => {
      const left = squareAt(0, 0, 3);
      const right = squareAt(1, 0, 3);
      const result = Boolean2.intersect([left], right, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(2, 1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(0.5, 1), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(3.5, 1), result.triMesh)).toBe(false);
    });

    test('returns empty region for disjoint squares', () => {
      const left = squareAt(0, 0, 1);
      const right = squareAt(3, 0, 1);
      const result = Boolean2.intersect([left], right, { mesh: true });

      expect(result.triMesh?.triangles.length ?? 0).toBe(0);
      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5), result.triMesh)).toBe(false);
    });
  });

  describe('subtract polygon', () => {
    test('cuts an inner square from an outer square', () => {
      const outer = squareAt(0, 0, 4);
      const inner = squareAt(1.5, 1.5, 1);
      const result = Boolean2.subtract([outer], inner, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(3.5, 3.5), result.triMesh)).toBe(true);
    });

    test('removes a corner overlap from a square', () => {
      const outer = squareAt(0, 0, 4);
      const corner = squareAt(2, 2, 2);
      const result = Boolean2.subtract([outer], corner, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(1, 1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(3, 3), result.triMesh)).toBe(false);
    });
    test('accepts an array of mixed clip geometries', () => {
      const outer = squareAt(0, 0, 4);
      const inner = squareAt(1.5, 1.5, 1);
      const result = Boolean2.subtract([outer], [xAxisHalfPlane, inner], { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(2, -0.5), result.triMesh)).toBe(false);
    });
  });

  describe('many with many', () => {
    test('intersect requires subject material inside every clip polygon', () => {
      const subjects = [squareAt(0, 0, 3), squareAt(2, 0, 3)];
      const clips = [squareAt(1, 0, 2), squareAt(0, 0, 2.5)];
      const result = Boolean2.intersect(subjects, clips, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(1.5, 1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(0.5, 1), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(3.5, 1), result.triMesh)).toBe(false);
    });

    test('intersect with perforated subject and multiple clip polygons', () => {
      const subjects = [squareAt(0, 0, 5), squareHole];
      const clips = [rectangle(0, 0, 5, 1.5), rectangle(0, 0, 1.5, 5)];
      const result = Boolean2.intersect(subjects, clips, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(3.5, 0.5), result.triMesh)).toBe(false);
    });

    test('subtract removes material inside any clip from multi-subject union', () => {
      const subjects = [squareAt(0, 0, 5), squareAt(4, 0, 3)];
      const clips = [squareAt(1, 1, 1), squareAt(5, 1, 1)];
      const result = Boolean2.subtract(subjects, clips, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(0.5, 0.5), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(1.5, 1.5), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(5.5, 1.5), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(6.5, 1.5), result.triMesh)).toBe(true);
    });

    test('subtract with subject holes and half-plane keeps hole loops in the kept half', () => {
      const scenario = boolean2ManySubtractScenarios.find((entry) => entry.name === 'Two subjects − holes + half')!;
      const result = evaluateBooleanScenario(scenario);

      expect(result.polygons.length).toBe(3);
      expect(pointInsideResult(result.polygons, new Vec2(1.5, 3.5), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(5.6, 2.9), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(0.5, 4), result.triMesh)).toBe(true);
    });

    test('subtract with multiple polygon clips on perforated subject', () => {
      const subjects = [squareAt(0, 0, 5), squareHole];
      const clips = [squareAt(3.5, 3.5, 1), squareAt(0.5, 3.5, 1)];
      const result = Boolean2.subtract(subjects, clips, { mesh: true });

      expect(pointInsideResult(result.polygons, new Vec2(1, 1), result.triMesh)).toBe(true);
      expect(pointInsideResult(result.polygons, new Vec2(2, 2), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(4, 4), result.triMesh)).toBe(false);
      expect(pointInsideResult(result.polygons, new Vec2(1, 4), result.triMesh)).toBe(false);
    });

    test('many×many visualisation scenarios evaluate with triangles', () => {
      for (const scenario of [...boolean2ManyIntersectScenarios, ...boolean2ManySubtractScenarios]) {
        const result = evaluateBooleanScenario(scenario);
        expect(result.triMesh?.triangles.length).toBeGreaterThan(0);
        expect(() => pointInsideScenario(scenario, new Vec2(0, 0))).not.toThrow();
      }
    });
  });

  describe('visualisation scenarios', () => {
    test('union scenarios produce non-empty results with sample interior points', () => {
      for (const scenario of boolean2UnionScenarios) {
        const result = evaluateBooleanScenario(scenario);
        expect(result.polygons.length).toBeGreaterThan(0);
        expect(result.triMesh?.triangles.length).toBeGreaterThan(0);
      }
    });

    test('intersect scenarios exclude points on the removed side of the clip', () => {
      for (const scenario of boolean2IntersectScenarios) {
        const result = evaluateBooleanScenario(scenario);
        expect(result.triMesh?.triangles.length).toBeGreaterThan(0);

        const removed = removedHalfSamplePoint(scenario);
        if (removed) {
          expect(pointInsideScenario(scenario, removed)).toBe(false);
        }
      }
    });

    test('subtract scenarios keep points on the kept side of the bisecting clip', () => {
      const scenario = boolean2SubtractScenarios[0]!;
      expect(pointInsideScenario(scenario, new Vec2(1, 1.5))).toBe(true);
      expect(pointInsideScenario(scenario, new Vec2(1, 0.5))).toBe(false);
    });

    test('polygon intersect scenarios keep only shared interior', () => {
      const scenario = boolean2IntersectPolygonScenarios[0]!;
      expect(pointInsideScenario(scenario, new Vec2(2, 1))).toBe(true);
      expect(pointInsideScenario(scenario, new Vec2(0.5, 1))).toBe(false);
    });

    test('polygon subtract scenarios remove clip interiors', () => {
      const scenario = boolean2SubtractPolygonScenarios[0]!;
      expect(pointInsideScenario(scenario, new Vec2(0.5, 0.5))).toBe(true);
      expect(pointInsideScenario(scenario, new Vec2(2, 2))).toBe(false);
    });

    test('all scenarios evaluate without error', () => {
      for (const scenario of boolean2Scenarios) {
        expect(() => evaluateBooleanScenario(scenario)).not.toThrow();
      }
    });
  });
});
