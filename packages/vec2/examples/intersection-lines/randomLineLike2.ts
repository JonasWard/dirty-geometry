import type { LineLike2 } from '../../src/geometry/kinds';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { Vec2 } from '../../src/core/vec2';
import { mulberry32 } from '../random';

export type RandomIntersectionScenario = {
  name: string;
  a: LineLike2;
  b: LineLike2;
};

/** Random Line2, Ray2, or InfiniteLine2 with base vectors in [-1, 1]; pass a seeded `rng` to reproduce it. */
export function randomLineLike2(rng: () => number = Math.random): LineLike2 {
  const kind = Math.floor(rng() * 3);
  const first = new Vec2(rng() * 2 - 1, rng() * 2 - 1);
  const second = new Vec2(rng() * 2 - 1, rng() * 2 - 1);

  switch (kind) {
    case 0:
      return new Line2(first, second);
    case 1:
      return new Ray2(first, second);
    default:
      return new InfiniteLine2(first, second);
  }
}

export function createRandomIntersectionScenario(
  index: number,
  rng: () => number = Math.random,
): RandomIntersectionScenario {
  return {
    name: `Random #${index + 1}`,
    a: randomLineLike2(rng),
    b: randomLineLike2(rng),
  };
}

/** `count` random scenarios; the same `seed` always gives the same scenarios. */
export function createRandomIntersectionScenarios(count: number, seed = 1): RandomIntersectionScenario[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, (_, index) => createRandomIntersectionScenario(index, rng));
}
