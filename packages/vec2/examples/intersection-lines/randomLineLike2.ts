import type { LineLike2 } from '../../src/geometry/kinds';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { Vec2 } from '../../src/core/vec2';

export type RandomIntersectionScenario = {
  name: string;
  a: LineLike2;
  b: LineLike2;
};

/** Autogenerates a random Line2, Ray2, or InfiniteLine2 with base vectors in [-1, 1]. */
export function randomLineLike2(): LineLike2 {
  const kind = Math.floor(Math.random() * 3);
  const first = new Vec2(Math.random() * 2 - 1, Math.random() * 2 - 1);
  const second = new Vec2(Math.random() * 2 - 1, Math.random() * 2 - 1);

  switch (kind) {
    case 0:
      return new Line2(first, second);
    case 1:
      return new Ray2(first, second);
    default:
      return new InfiniteLine2(first, second);
  }
}

export function createRandomIntersectionScenario(index: number): RandomIntersectionScenario {
  return {
    name: `Random #${index + 1}`,
    a: randomLineLike2(),
    b: randomLineLike2(),
  };
}

export function createRandomIntersectionScenarios(count: number): RandomIntersectionScenario[] {
  return Array.from({ length: count }, (_, index) => createRandomIntersectionScenario(index));
}
