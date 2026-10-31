/**
 * Winding numbers and fill rules for closed loops.
 *
 * A horizontal ray from the query point to +x crosses some edges: upward crossings add 1, downward ones
 * subtract 1. The sum is the winding number. Each crossing changes it by exactly ±1, so its parity equals
 * the crossing count's, and the even-odd rule is "winding number is odd". Both rules use one edge test.
 */
import type { Vec2 } from '../../core/vec2';

/** `nonZero`: inside where the winding number is not 0. `evenOdd`: inside where it is odd. */
export type FillRule = 'nonZero' | 'evenOdd';

/** A closed loop: its last vertex joins its first. Clockwise loops count negative, so they act as holes. */
type Loop = { readonly vertices: readonly Vec2[] };

/** Contribution of edge `a → b` to the winding number at `(x, y)`: +1, −1 or 0. */
export function windingStep(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const side = (bx - ax) * (y - ay) - (by - ay) * (x - ax); // Vec2.orient(a, b, point)
  if (ay <= y) return by > y && side > 0 ? 1 : 0;
  return by <= y && side < 0 ? -1 : 0;
}

/** Summed winding number of `loops` at `point`. */
export function windingNumber(loops: readonly Loop[], point: Vec2): number {
  let winding = 0;
  for (const { vertices } of loops) {
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]!;
      const b = vertices[(i + 1) % vertices.length]!;
      winding += windingStep(a.x, a.y, b.x, b.y, point.x, point.y);
    }
  }
  return winding;
}

/** Is a point with this winding number inside under `rule`? */
export function insideByRule(winding: number, rule: FillRule): boolean {
  return rule === 'nonZero' ? winding !== 0 : (winding & 1) !== 0;
}

/**
 * {@link windingNumber} for many queries against the same loops. Only edges whose y-range covers the query
 * can contribute, so edges are bucketed into horizontal slabs once and a query visits its own slab. The
 * result is the same as {@link windingNumber}. A snapshot: build it after the loops are final.
 */
export class WindingIndex {
  /** Per slab, edge coordinates as `ax, ay, bx, by` runs. */
  private readonly slabs: number[][] = [];
  private readonly minY: number = Infinity;
  private readonly height: number = 1;

  constructor(loops: readonly Loop[]) {
    let maxY = -Infinity;
    let edges = 0;
    for (const { vertices } of loops) {
      edges += vertices.length;
      for (const v of vertices) {
        this.minY = Math.min(this.minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
    if (edges === 0) return;
    const count = Math.max(1, Math.ceil(Math.sqrt(edges)));
    this.height = (maxY - this.minY) / count || 1;
    for (let i = 0; i < count; i++) this.slabs.push([]);
    for (const { vertices } of loops) {
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i]!;
        const b = vertices[(i + 1) % vertices.length]!;
        const last = this.slab(Math.max(a.y, b.y));
        for (let k = this.slab(Math.min(a.y, b.y)); k <= last; k++) this.slabs[k]!.push(a.x, a.y, b.x, b.y);
      }
    }
  }

  private slab(y: number): number {
    return Math.min(this.slabs.length - 1, Math.max(0, Math.floor((y - this.minY) / this.height)));
  }

  winding(point: Vec2): number {
    if (this.slabs.length === 0) return 0;
    const edges = this.slabs[this.slab(point.y)]!;
    let winding = 0;
    for (let i = 0; i < edges.length; i += 4) {
      winding += windingStep(edges[i]!, edges[i + 1]!, edges[i + 2]!, edges[i + 3]!, point.x, point.y);
    }
    return winding;
  }

  contains(point: Vec2, rule: FillRule): boolean {
    return insideByRule(this.winding(point), rule);
  }
}
