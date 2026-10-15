import type { LineLike2IntersectionResult } from '@dirty-geometry/vec2/operations/intersection/line2-like';
import type { LineLike2 } from '@dirty-geometry/vec2/geometry/kinds';
import { intersectionLines } from '@dirty-geometry/vec2/operations/intersection/line2-like';
import { InfiniteLine2 } from '@dirty-geometry/vec2/geometry/primitives/infinite-line2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { Ray2 } from '@dirty-geometry/vec2/geometry/primitives/ray2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { createRandomIntersectionScenarios } from '@dirty-geometry/vec2/examples/intersection-lines/randomLineLike2';

export type IntersectionScenario = {
  name: string;
  a: LineLike2;
  b: LineLike2;
};

export const fixedIntersectionScenarios: IntersectionScenario[] = [
  {
    name: 'Infinite × Infinite',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new InfiniteLine2(new Vec2(1, 0), new Vec2(0, 1)),
  },
  {
    name: 'Infinite × Infinite (parallel)',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new InfiniteLine2(new Vec2(0, 1), new Vec2(1, 0)),
  },
  {
    name: 'Infinite × Infinite (colinear)',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new InfiniteLine2(new Vec2(1, 0), new Vec2(-1, 0)),
  },
  {
    name: 'Ray × Ray',
    a: new Ray2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(1, -1.5), new Vec2(0, 1)),
  },
  {
    name: 'Ray × Ray (behind)',
    a: new Ray2(new Vec2(1.5, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(-1.5, 1.5), new Vec2(0, -1)),
  },
  {
    name: 'Ray × Ray (overlap)',
    a: new Ray2(new Vec2(-1.5, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(0, 0), new Vec2(1, 0)),
  },
  {
    name: 'Line × Line',
    a: new Line2(new Vec2(-1.5, 0), new Vec2(1.5, 0)),
    b: new Line2(new Vec2(0, -1.5), new Vec2(0, 1.5)),
  },
  {
    name: 'Line × Line (parallel)',
    a: new Line2(new Vec2(-1.5, 0), new Vec2(1.5, 0)),
    b: new Line2(new Vec2(-1.5, 0.5), new Vec2(1.5, 0.5)),
  },
  {
    name: 'Line × Line (overlap)',
    a: new Line2(new Vec2(-1.5, 0), new Vec2(0.5, 0)),
    b: new Line2(new Vec2(-0.5, 0), new Vec2(1.5, 0)),
  },
  {
    name: 'Line × Line (touch)',
    a: new Line2(new Vec2(-1.5, 0), new Vec2(0, 0)),
    b: new Line2(new Vec2(0, 0), new Vec2(1.5, 0)),
  },
  {
    name: 'Line × Line (outside)',
    a: new Line2(new Vec2(-1.5, 0), new Vec2(0.5, 0)),
    b: new Line2(new Vec2(1.5, -1.5), new Vec2(1.5, 1.5)),
  },
  {
    name: 'Infinite × Ray',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Ray2(new Vec2(1, -1.5), new Vec2(0, 1)),
  },
  {
    name: 'Infinite × Line',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Line2(new Vec2(1, -1.5), new Vec2(1, 1.5)),
  },
  {
    name: 'Ray × Line',
    a: new Ray2(new Vec2(0, 0), new Vec2(1, 0)),
    b: new Line2(new Vec2(1, -1.5), new Vec2(1, 1.5)),
  },
  {
    name: 'Non-unit directions',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1.5, 0)),
    b: new InfiniteLine2(new Vec2(0, 0), new Vec2(0, 1.5)),
  },
];

/** Non-axis-aligned cases (kept within the [-2, 2] visualisation frame). */
export const angledIntersectionScenarios: IntersectionScenario[] = [
  {
    name: 'Angled ∞ × ∞',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1)),
    b: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, -1)),
  },
  {
    name: 'Angled ∞ × ∞ (parallel)',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1)),
    b: new InfiniteLine2(new Vec2(0, 1), new Vec2(2, 2)),
  },
  {
    name: 'Angled ∞ × ∞ (colinear)',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1)),
    b: new InfiniteLine2(new Vec2(1, 1), new Vec2(-1, -1)),
  },
  {
    name: 'Angled Line × Line',
    a: new Line2(new Vec2(-1.5, -1.5), new Vec2(1.5, 1.5)),
    b: new Line2(new Vec2(-1.5, 1.5), new Vec2(1.5, -1.5)),
  },
  {
    name: 'Angled Line × Line (parallel)',
    a: new Line2(new Vec2(-1.5, -1), new Vec2(1.5, 2)),
    b: new Line2(new Vec2(-1.5, -0.4), new Vec2(1.5, 2.6)),
  },
  {
    name: 'Angled Line × Line (overlap)',
    a: new Line2(new Vec2(-1.5, -1.5), new Vec2(0.5, 0.5)),
    b: new Line2(new Vec2(-0.5, -0.5), new Vec2(1.5, 1.5)),
  },
  {
    name: 'Angled Line × Line (touch)',
    a: new Line2(new Vec2(-1.5, -1.5), new Vec2(0, 0)),
    b: new Line2(new Vec2(0, 0), new Vec2(1.5, 1.5)),
  },
  {
    name: 'Angled Line × Line (outside)',
    a: new Line2(new Vec2(-1.5, -1.5), new Vec2(-0.25, -0.25)),
    b: new Line2(new Vec2(0.25, 1.5), new Vec2(1.5, 0.25)),
  },
  {
    name: 'Angled Ray × Ray',
    a: new Ray2(new Vec2(-1.5, -1), new Vec2(1, 1)),
    b: new Ray2(new Vec2(1.5, -1), new Vec2(-1, 1)),
  },
  {
    name: 'Angled Ray × Ray (behind)',
    a: new Ray2(new Vec2(0.5, 0.5), new Vec2(1, 1)),
    b: new Ray2(new Vec2(-0.5, 0.5), new Vec2(-1, 1)),
  },
  {
    name: 'Angled Ray × Ray (overlap)',
    a: new Ray2(new Vec2(-1.5, -1.5), new Vec2(1, 1)),
    b: new Ray2(new Vec2(0, 0), new Vec2(1, 1)),
  },
  {
    name: 'Angled Ray × Ray (anti-parallel touch)',
    a: new Ray2(new Vec2(0, 0), new Vec2(1, 1)),
    b: new Ray2(new Vec2(0, 0), new Vec2(-1, -1)),
  },
  {
    name: 'Angled ∞ × Ray',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0.5)),
    b: new Ray2(new Vec2(0, 1.5), new Vec2(0.5, -1)),
  },
  {
    name: 'Angled ∞ × Line',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, -0.5)),
    b: new Line2(new Vec2(-1, 1.5), new Vec2(1.5, -1)),
  },
  {
    name: 'Angled Ray × Line',
    a: new Ray2(new Vec2(-1.5, -0.5), new Vec2(1, 0.5)),
    b: new Line2(new Vec2(-1, 1.5), new Vec2(1.5, -1)),
  },
  {
    name: 'Angled ∞ × colinear Ray',
    a: new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 1)),
    b: new Ray2(new Vec2(-0.5, -0.5), new Vec2(1, 1)),
  },
];

export const randomIntersectionScenarios = createRandomIntersectionScenarios(12);

export const intersectionLines2Scenarios: IntersectionScenario[] = [
  ...fixedIntersectionScenarios,
  ...angledIntersectionScenarios,
  ...randomIntersectionScenarios,
];

export function evaluateIntersectionScenario(scenario: IntersectionScenario): LineLike2IntersectionResult {
  return intersectionLines(scenario.a, scenario.b);
}
