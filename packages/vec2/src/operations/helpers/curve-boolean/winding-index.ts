/**
 * Winding numbers of many loops with arcs, for many queries. Gives the same totals as summing
 * `ArcPolygon2.windingNumber` (chord polygon plus ±1 inside each arc's cap), but a query only visits the
 * chords and caps whose y-range covers it.
 */
import type { Vec2 } from '../../../core/vec2';
import type { ArcPolygon2 } from '../../../geometry/regions/arc-polygon2';
import { capStep, windingStep } from '../../../geometry/regions/winding';

/** Chord `a → b` of one operand: `ax, ay, bx, by, operand` runs. */
const CHORD = 5;
/** Arc cap: `centre x, y, radius, from x, y, chord x, y, sagitta sign, operand, box min x, max x` runs. */
const CAP = 11;

/**
 * @internal One winding total per operand (an operand is a group of loops, such as the subject or one clip
 * region). A snapshot of the loops it was built from.
 */
export class ArcWindingIndex {
  private readonly chords: number[][] = [];
  private readonly caps: number[][] = [];
  private readonly minY: number = Infinity;
  private readonly height: number = 1;
  private readonly totals: number[];

  constructor(operands: readonly (readonly ArcPolygon2[])[]) {
    this.totals = new Array<number>(operands.length).fill(0);
    let maxY = -Infinity;
    let count = 0;
    for (const loops of operands) {
      for (const loop of loops) {
        const box = loop.aabb2();
        this.minY = Math.min(this.minY, box.y.min);
        maxY = Math.max(maxY, box.y.max);
        count += loop.vertices.length;
      }
    }
    if (count === 0) return;
    const slabs = Math.max(1, Math.ceil(Math.sqrt(count)));
    this.height = (maxY - this.minY) / slabs || 1;
    for (let i = 0; i < slabs; i++) {
      this.chords.push([]);
      this.caps.push([]);
    }

    operands.forEach((loops, operand) => {
      for (const loop of loops) {
        const vertices = loop.vertices;
        for (let i = 0; i < vertices.length; i++) {
          const a = vertices[i]!;
          const b = vertices[(i + 1) % vertices.length]!;
          for (let k = this.slab(Math.min(a.y, b.y)); k <= this.slab(Math.max(a.y, b.y)); k++) {
            this.chords[k]!.push(a.x, a.y, b.x, b.y, operand);
          }
        }
        for (const segment of loop.segments()) {
          if (segment.type !== 'Arc2') continue;
          const centre = segment.centre();
          const { from, to } = segment;
          // The cap lies within the arc's box (it is inside the arc's convex hull).
          const box = segment.aabb2();
          const run = [
            centre.x,
            centre.y,
            segment.radius(),
            from.x,
            from.y,
            to.x - from.x,
            to.y - from.y,
            Math.sign(segment.sagitta),
            operand,
            box.x.min,
            box.x.max,
          ];
          for (let k = this.slab(box.y.min); k <= this.slab(box.y.max); k++) this.caps[k]!.push(...run);
        }
      }
    });
  }

  private slab(y: number): number {
    return Math.min(this.chords.length - 1, Math.max(0, Math.floor((y - this.minY) / this.height)));
  }

  /** Winding total per operand at `point`. The array is reused by the next call. */
  winding(point: Vec2): readonly number[] {
    const totals = this.totals.fill(0);
    if (this.chords.length === 0) return totals;
    const { x, y } = point;
    const k = this.slab(y);

    const chords = this.chords[k]!;
    for (let i = 0; i < chords.length; i += CHORD) {
      const step = windingStep(chords[i]!, chords[i + 1]!, chords[i + 2]!, chords[i + 3]!, x, y);
      if (step !== 0) totals[chords[i + 4]!]! += step;
    }

    const caps = this.caps[k]!;
    for (let i = 0; i < caps.length; i += CAP) {
      if (x < caps[i + 9]! || x > caps[i + 10]!) continue;
      const step = capStep(
        caps[i]!,
        caps[i + 1]!,
        caps[i + 2]!,
        caps[i + 3]!,
        caps[i + 4]!,
        caps[i + 5]!,
        caps[i + 6]!,
        caps[i + 7]!,
        x,
        y,
      );
      if (step !== 0) totals[caps[i + 8]!]! += step;
    }
    return totals;
  }
}
