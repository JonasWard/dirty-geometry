/**
 * Exact geometric predicates (adaptive-precision, Shewchuk-style, via `robust-predicates`). They decide
 * signs exactly, so combinatorial decisions (which side, inside a circle) do not depend on scale.
 */
import { incircle, orient2d } from 'robust-predicates';
import type { Vec2 } from './vec2';

/**
 * Exact orientation of `a → b → c`: positive when counter-clockwise (`c` left of `a → b`), negative when
 * clockwise, 0 when collinear. Same sign convention as `Vec2.orient` (`robust-predicates` uses the opposite).
 */
export function orient(a: Vec2, b: Vec2, c: Vec2): number {
  const value = -orient2d(a.x, a.y, b.x, b.y, c.x, c.y);
  return value === 0 ? 0 : value;
}

/**
 * Exact in-circle test: positive when `d` lies strictly inside the circle through `a, b, c` given
 * counter-clockwise, negative outside, 0 on it. The sign flips for clockwise `a, b, c`.
 */
export function inCircle(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  const value = incircle(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
  return value === 0 ? 0 : value;
}
