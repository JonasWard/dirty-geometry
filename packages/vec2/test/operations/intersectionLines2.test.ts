import { randomLineLike2 } from '../../examples/intersection-lines/randomLineLike2';
import { describe, expect, test } from 'bun:test';
import { intersectionLines, type LineLike2IntersectionResult } from '../../src/operations/intersection/line2-like';
import { type LineLike2 } from '../../src/geometry/kinds';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { Vec2 } from '../../src/core/vec2';
import { expectVec2Close } from '../testHelpers';

function expectPointResult(result: LineLike2IntersectionResult, expected: Vec2): void {
  expect(result).toBeInstanceOf(Vec2);
  expectVec2Close(result as Vec2, expected);
}

describe('intersectionLines', () => {
  test('infinite with infinite returns a point', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new InfiniteLine2(new Vec2(5, 0), new Vec2(0, 1));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('infinite with infinite returns null when parallel and separated', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new InfiniteLine2(new Vec2(0, 1), new Vec2(2, 0));

    expect(a.intersect(b)).toBeNull();
  });

  test('colinear infinite lines return an infinite line', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new InfiniteLine2(new Vec2(3, 0), new Vec2(-2, 0));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(InfiniteLine2);
  });

  test('ray with ray returns a point', () => {
    const a = new Ray2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Ray2(new Vec2(5, -5), new Vec2(0, 1));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('ray with ray returns null when intersection is behind a ray', () => {
    const a = new Ray2(new Vec2(10, 0), new Vec2(1, 0));
    const b = new Ray2(new Vec2(0, 5), new Vec2(0, -1));

    expect(a.intersect(b)).toBeNull();
  });

  test('overlapping colinear rays return a ray', () => {
    const a = new Ray2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Ray2(new Vec2(2, 0), new Vec2(1, 0));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Ray2);
    expectVec2Close((result as Ray2).start, new Vec2(2, 0));
  });

  test('opposite colinear rays that touch return a point', () => {
    const a = new Ray2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Ray2(new Vec2(0, 0), new Vec2(-1, 0));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(0, 0));
  });

  test('line with line returns a point', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(10, 0));
    const b = new Line2(new Vec2(5, -5), new Vec2(5, 5));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('line with line returns null when parallel and separated', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(10, 0));
    const b = new Line2(new Vec2(0, 1), new Vec2(10, 1));

    expect(a.intersect(b)).toBeNull();
  });

  test('overlapping colinear lines return a line segment', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(10, 0));
    const b = new Line2(new Vec2(5, 0), new Vec2(15, 0));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Line2);
    expectVec2Close((result as Line2).from, new Vec2(5, 0));
    expectVec2Close((result as Line2).to, new Vec2(10, 0));
  });

  test('colinear lines that touch at an endpoint return a point', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(5, 0));
    const b = new Line2(new Vec2(5, 0), new Vec2(10, 0));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('line with line returns null when lines intersect outside segments', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(5, 0));
    const b = new Line2(new Vec2(10, -5), new Vec2(10, 5));

    expect(a.intersect(b)).toBeNull();
  });

  test('infinite with ray returns a point', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Ray2(new Vec2(5, -5), new Vec2(0, 1));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('infinite with colinear ray returns a ray', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Ray2(new Vec2(2, 0), new Vec2(1, 0));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Ray2);
    expectVec2Close((result as Ray2).start, new Vec2(2, 0));
  });

  test('infinite with line returns a point', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Line2(new Vec2(5, -5), new Vec2(5, 5));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('infinite with colinear line returns the segment', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Line2(new Vec2(1, 0), new Vec2(4, 0));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Line2);
    expectVec2Close((result as Line2).from, new Vec2(1, 0));
    expectVec2Close((result as Line2).to, new Vec2(4, 0));
  });

  test('ray with line returns a point', () => {
    const a = new Ray2(new Vec2(0, 0), new Vec2(1, 0));
    const b = new Line2(new Vec2(5, -5), new Vec2(5, 5));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(5, 0));
  });

  test('intersectionLines point result is the same when arguments are swapped', () => {
    const a = new Line2(new Vec2(0, 0), new Vec2(10, 0));
    const b = new Ray2(new Vec2(5, -5), new Vec2(0, 1));

    const ab = intersectionLines(a, b);
    const ba = intersectionLines(b, a);

    expectPointResult(ab, new Vec2(5, 0));
    expectPointResult(ba, new Vec2(5, 0));
  });

  test('works with non-unit directions', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(2, 0));
    const b = new InfiniteLine2(new Vec2(0, 0), new Vec2(0, 3));
    const result = a.intersect(b);

    expectPointResult(result, new Vec2(0, 0));
  });

  test('angled infinite lines cross at the origin', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1));
    const b = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, -1));

    expectPointResult(a.intersect(b), new Vec2(0, 0));
  });

  test('angled infinite lines return null when parallel and separated', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1));
    const b = new InfiniteLine2(new Vec2(0, 1), new Vec2(2, 2));

    expect(a.intersect(b)).toBeNull();
  });

  test('angled colinear infinite lines return an infinite line', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1));
    const b = new InfiniteLine2(new Vec2(1, 1), new Vec2(-1, -1));

    expect(a.intersect(b)).toBeInstanceOf(InfiniteLine2);
  });

  test('angled line segments cross at the origin', () => {
    const a = new Line2(new Vec2(-1.5, -1.5), new Vec2(1.5, 1.5));
    const b = new Line2(new Vec2(-1.5, 1.5), new Vec2(1.5, -1.5));

    expectPointResult(a.intersect(b), new Vec2(0, 0));
  });

  test('angled parallel line segments return null when separated', () => {
    const a = new Line2(new Vec2(-1.5, -1), new Vec2(1.5, 2));
    const b = new Line2(new Vec2(-1.5, -0.4), new Vec2(1.5, 2.6));

    expect(a.intersect(b)).toBeNull();
  });

  test('angled overlapping colinear segments return the overlap', () => {
    const a = new Line2(new Vec2(-1.5, -1.5), new Vec2(0.5, 0.5));
    const b = new Line2(new Vec2(-0.5, -0.5), new Vec2(1.5, 1.5));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Line2);
    expectVec2Close((result as Line2).from, new Vec2(-0.5, -0.5));
    expectVec2Close((result as Line2).to, new Vec2(0.5, 0.5));
  });

  test('angled colinear segments that touch return a point', () => {
    const a = new Line2(new Vec2(-1.5, -1.5), new Vec2(0, 0));
    const b = new Line2(new Vec2(0, 0), new Vec2(1.5, 1.5));

    expectPointResult(a.intersect(b), new Vec2(0, 0));
  });

  test('angled segments return null when the crossing is outside both', () => {
    const a = new Line2(new Vec2(-1.5, -1.5), new Vec2(-0.25, -0.25));
    const b = new Line2(new Vec2(0.25, 1.5), new Vec2(1.5, 0.25));

    expect(a.intersect(b)).toBeNull();
  });

  test('angled rays cross at a point', () => {
    const a = new Ray2(new Vec2(-1.5, -1), new Vec2(1, 1));
    const b = new Ray2(new Vec2(1.5, -1), new Vec2(-1, 1));

    expectPointResult(a.intersect(b), new Vec2(0, 0.5));
  });

  test('angled rays return null when the crossing is behind both', () => {
    const a = new Ray2(new Vec2(0.5, 0.5), new Vec2(1, 1));
    const b = new Ray2(new Vec2(-0.5, 0.5), new Vec2(-1, 1));

    expect(a.intersect(b)).toBeNull();
  });

  test('angled overlapping colinear rays return a ray', () => {
    const a = new Ray2(new Vec2(-1.5, -1.5), new Vec2(1, 1));
    const b = new Ray2(new Vec2(0, 0), new Vec2(1, 1));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Ray2);
    expectVec2Close((result as Ray2).start, new Vec2(0, 0));
  });

  test('angled opposite colinear rays that touch return a point', () => {
    const a = new Ray2(new Vec2(0, 0), new Vec2(1, 1));
    const b = new Ray2(new Vec2(0, 0), new Vec2(-1, -1));

    expectPointResult(a.intersect(b), new Vec2(0, 0));
  });

  test('angled infinite with ray returns a point', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0.5));
    const b = new Ray2(new Vec2(0, 1.5), new Vec2(0.5, -1));
    // a: (t, 0.5 t), b: (0.5 s, 1.5 - s) → t = 0.5 s, 0.5 t = 1.5 - s
    // 0.25 s = 1.5 - s → 1.25 s = 1.5 → s = 1.2, t = 0.6 → (0.6, 0.3)
    expectPointResult(a.intersect(b), new Vec2(0.6, 0.3));
  });

  test('angled infinite with line returns a point', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, -0.5));
    const b = new Line2(new Vec2(-1, 1.5), new Vec2(1.5, -1));
    // b: (-1, 1.5) + u (2.5, -2.5), a: (t, -0.5 t)
    // -1 + 2.5 u = t, 1.5 - 2.5 u = -0.5 t
    // 1.5 - 2.5 u = -0.5 (-1 + 2.5 u) = 0.5 - 1.25 u
    // 1 = 1.25 u → u = 0.8, t = -1 + 2 = 1 → (1, -0.5)
    expectPointResult(a.intersect(b), new Vec2(1, -0.5));
  });

  test('angled ray with line returns a point', () => {
    const a = new Ray2(new Vec2(-1.5, -0.5), new Vec2(1, 0.5));
    const b = new Line2(new Vec2(-1, 1.5), new Vec2(1.5, -1));
    // a: (-1.5 + t, -0.5 + 0.5 t), b: (-1 + 2.5 u, 1.5 - 2.5 u)
    // -1.5 + t = -1 + 2.5 u → t = 0.5 + 2.5 u
    // -0.5 + 0.5 t = 1.5 - 2.5 u
    // -0.5 + 0.5(0.5 + 2.5 u) = 1.5 - 2.5 u
    // -0.5 + 0.25 + 1.25 u = 1.5 - 2.5 u
    // -0.25 + 1.25 u = 1.5 - 2.5 u
    // 3.75 u = 1.75 → u = 7/15, t = 0.5 + 2.5*(7/15) = 0.5 + 7/6 = 5/3
    // point: (-1.5 + 5/3, -0.5 + 0.5*(5/3)) = (1/6, 1/3)
    expectPointResult(a.intersect(b), new Vec2(1 / 6, 1 / 3));
  });

  test('angled infinite with colinear ray returns a ray', () => {
    const a = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1));
    const b = new Ray2(new Vec2(-0.5, -0.5), new Vec2(1, 1));
    const result = a.intersect(b);

    expect(result).toBeInstanceOf(Ray2);
    expectVec2Close((result as Ray2).start, new Vec2(-0.5, -0.5));
  });
});

const RANDOM_ITERATIONS = 250;
const RANDOM_SEED = 42;

function randomUnit(seed: number, index: number): number {
  const x = Math.sin(seed + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function randomVec2(seed: number, index: number): Vec2 {
  return new Vec2(randomUnit(seed, index * 2) * 40 - 20, randomUnit(seed, index * 2 + 1) * 40 - 20);
}

function randomDirection(seed: number, index: number): Vec2 {
  for (let attempt = 0; attempt < 8; attempt++) {
    const direction = randomVec2(seed, index * 10 + attempt);

    if (direction.length() > 0.5) {
      return direction;
    }
  }

  return new Vec2(1, 0.25);
}

function randomLineLike(seed: number, index: number): LineLike2 {
  const kind = Math.floor(randomUnit(seed, index * 3) * 3);
  const origin = randomVec2(seed, index * 5);
  const direction = randomDirection(seed, index * 7);
  const scale = 0.5 + randomUnit(seed, index * 11) * 3;

  if (kind === 0) {
    return new Line2(origin, origin.add(direction.scale(scale)));
  }

  if (kind === 1) {
    return new Ray2(origin, direction.scale(scale));
  }

  return new InfiniteLine2(origin, direction.scale(scale));
}

function lineOrigin(line: LineLike2): Vec2 {
  if (line instanceof Line2) {
    return line.from;
  }

  if (line instanceof Ray2) {
    return line.start;
  }

  if (line instanceof InfiniteLine2) {
    return line.through;
  }

  return line.through();
}

describe('intersectionLines random', () => {
  test('point intersections agree when arguments are swapped', () => {
    for (let i = 0; i < RANDOM_ITERATIONS; i++) {
      const a = randomLineLike(RANDOM_SEED, i * 2);
      const b = randomLineLike(RANDOM_SEED, i * 2 + 1);
      const result = intersectionLines(a, b);

      if (!(result instanceof Vec2)) {
        continue;
      }

      const swapped = intersectionLines(b, a);
      expect(swapped).toBeInstanceOf(Vec2);
      expectVec2Close(result, swapped as Vec2);
    }
  });

  test('separated parallel random pairs do not intersect', () => {
    for (let i = 0; i < RANDOM_ITERATIONS; i++) {
      const direction = randomDirection(RANDOM_SEED + 1, i);
      const originA = randomVec2(RANDOM_SEED + 2, i * 2);
      let originB = randomVec2(RANDOM_SEED + 3, i * 2 + 1);
      const scaleA = 0.5 + randomUnit(RANDOM_SEED + 4, i) * 2;
      const scaleB = 0.5 + randomUnit(RANDOM_SEED + 5, i) * 2;
      const normal = direction.perpendicular().unit();

      // Force a clear perpendicular separation.
      originB = originA.add(normal.scale(1 + randomUnit(RANDOM_SEED + 6, i)));

      const a =
        i % 3 === 0
          ? new Line2(originA, originA.add(direction.scale(scaleA)))
          : i % 3 === 1
            ? new Ray2(originA, direction.scale(scaleA))
            : new InfiniteLine2(originA, direction.scale(scaleA));

      const b =
        i % 3 === 0
          ? new Line2(originB, originB.add(direction.scale(scaleB)))
          : i % 3 === 1
            ? new Ray2(originB, direction.scale(scaleB))
            : new InfiniteLine2(originB, direction.scale(scaleB));

      expect(intersectionLines(a, b)).toBeNull();
    }
  });

  test('non-parallel infinite lines always intersect at a point', () => {
    for (let i = 0; i < RANDOM_ITERATIONS; i++) {
      const a = new InfiniteLine2(randomVec2(RANDOM_SEED + 5, i * 2), randomDirection(RANDOM_SEED + 6, i * 2));
      let dirB = randomDirection(RANDOM_SEED + 7, i * 2 + 1);

      while (Math.abs(a.direction.crossProduct(dirB)) < 1e-4) {
        dirB = randomDirection(RANDOM_SEED + 8, i * 2 + 100);
      }

      const b = new InfiniteLine2(randomVec2(RANDOM_SEED + 9, i * 2 + 1), dirB);
      const result = intersectionLines(a, b);

      expect(result).toBeInstanceOf(Vec2);
    }
  });

  test('known intersection lies on both random lines when constructed through a point', () => {
    for (let i = 0; i < RANDOM_ITERATIONS; i++) {
      const point = randomVec2(RANDOM_SEED + 10, i);
      let dir0 = randomDirection(RANDOM_SEED + 11, i * 2);
      let dir1 = randomDirection(RANDOM_SEED + 12, i * 2 + 1);

      while (Math.abs(dir0.crossProduct(dir1)) < 1e-4) {
        dir1 = randomDirection(RANDOM_SEED + 13, i * 2 + 500);
      }

      const a = new InfiniteLine2(point, dir0);
      const b = new InfiniteLine2(point, dir1);
      const result = intersectionLines(a, b);

      expectPointResult(result, point);
      expectVec2Close(lineOrigin(a), point);
      expectVec2Close(lineOrigin(b), point);
    }
  });

  test('colinear infinite lines return an infinite overlap', () => {
    for (let i = 0; i < RANDOM_ITERATIONS; i++) {
      const direction = randomDirection(RANDOM_SEED + 20, i);
      const origin = randomVec2(RANDOM_SEED + 21, i);
      const a = new InfiniteLine2(origin, direction);
      const b = new InfiniteLine2(
        origin.add(direction.scale(randomUnit(RANDOM_SEED + 22, i) * 4 - 2)),
        direction.scale(-1),
      );
      const result = intersectionLines(a, b);

      expect(result).toBeInstanceOf(InfiniteLine2);
    }
  });

  test('randomLineLike2 produces valid geometries in [-1, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const line = randomLineLike2();

      if (line instanceof Line2) {
        expect(line.from.x).toBeGreaterThanOrEqual(-1);
        expect(line.from.x).toBeLessThanOrEqual(1);
        expect(line.to.y).toBeGreaterThanOrEqual(-1);
        expect(line.to.y).toBeLessThanOrEqual(1);
        continue;
      }

      if (line instanceof Ray2) {
        expect(line.start.x).toBeGreaterThanOrEqual(-1);
        expect(line.start.y).toBeLessThanOrEqual(1);
        expect(line.direction.x).toBeGreaterThanOrEqual(-1);
        expect(line.direction.y).toBeLessThanOrEqual(1);
        continue;
      }

      expect(line).toBeInstanceOf(InfiniteLine2);
      if (!(line instanceof InfiniteLine2)) continue;

      expect(line.through.x).toBeGreaterThanOrEqual(-1);
      expect(line.through.y).toBeLessThanOrEqual(1);
      expect(line.direction.x).toBeGreaterThanOrEqual(-1);
      expect(line.direction.y).toBeLessThanOrEqual(1);
    }
  });

  test('randomLineLike2 pairs are null, a point, or a line-like overlap', () => {
    for (let i = 0; i < 100; i++) {
      const a = randomLineLike2();
      const b = randomLineLike2();
      const result = intersectionLines(a, b);

      if (result === null) {
        continue;
      }

      if (result instanceof Vec2) {
        continue;
      }

      expect(result instanceof Line2 || result instanceof Ray2 || result instanceof InfiniteLine2).toBe(true);
    }
  });
});
