import { describe, expect, test } from 'bun:test';
import { Mat3 } from '../../src/core/mat3';
import { Vec2 } from '../../src/core/vec2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Boolean2, type Boolean2Result } from '../../src/operations/boolean2';
import { roundedRectangle } from '../../examples/arc-shapes';
import { ArcWindingIndex } from '../../src/operations/helpers/curve-boolean/winding-index';

const V = (x: number, y: number) => new Vec2(x, y);
const disc = (x: number, y: number, r = 1) => new Circle2(V(x, y), r);
const square = (min: number, max: number) => new Polygon2([V(min, min), V(max, min), V(max, max), V(min, max)]);
const regionArea = (result: Boolean2Result) => (result.regions ?? []).reduce((sum, r) => sum + r.signedArea(), 0);
const polygonArea = (result: Boolean2Result) => result.polygons.reduce((sum, p) => sum + p.signedArea(), 0);
const arcCount = (region: ArcPolygon2) => region.sagittas.filter((s) => s !== 0).length;

/** Two unit discs whose centres are 1 apart: the lens they share, and their union. */
const lens = 2 * Math.acos(0.5) - 0.5 * Math.sqrt(3);
const discs = [disc(0, 0), disc(1, 0)];

describe('Boolean2 with arcs, exact', () => {
  test('union of two discs: one region of two arcs', () => {
    const result = Boolean2.union(discs);
    expect(result.polygons).toEqual([]);
    expect(result.regions!.length).toBe(1);
    expect(arcCount(result.regions![0]!)).toBe(2);
    expect(regionArea(result)).toBeCloseTo(2 * Math.PI - lens, 9);
  });

  test('intersection of two discs: a lens', () => {
    const result = Boolean2.intersect([discs[0]!], [discs[1]!]);
    expect(result.regions!.length).toBe(1);
    expect(result.regions![0]!.segmentCount()).toBe(2);
    expect(regionArea(result)).toBeCloseTo(lens, 9);
  });

  test('disc minus disc: a crescent', () => {
    const result = Boolean2.subtract([discs[0]!], [discs[1]!]);
    expect(regionArea(result)).toBeCloseTo(Math.PI - lens, 9);
  });

  test('square minus a central disc: the square and a clockwise hole', () => {
    const result = Boolean2.subtract([square(-2, 2)], [disc(0, 0)]);
    const regions = result.regions!;
    expect(regions.length).toBe(2);
    const [outer, hole] = [...regions].sort((a, b) => b.signedArea() - a.signedArea());
    expect(outer!.signedArea()).toBeCloseTo(16, 9);
    expect(outer!.segmentCount()).toBe(4); // the split-free square edges stay four lines
    expect(hole!.signedArea()).toBeCloseTo(-Math.PI, 9);
    expect(regionArea(result)).toBeCloseTo(16 - Math.PI, 9);
  });

  test('disc cut by a half-plane: one arc and one line', () => {
    const below = new InfiniteLine2(V(0, 0), V(1, 0)); // inside where y <= 0
    const result = Boolean2.intersect([disc(0, 0, 2)], [below]);
    expect(result.regions!.length).toBe(1);
    const half = result.regions![0]!;
    expect(half.segmentCount()).toBe(2);
    expect(arcCount(half)).toBe(1);
    expect(regionArea(result)).toBeCloseTo(2 * Math.PI, 9);
    expect(half.containsPoint(V(0, -1))).toBe(true);
  });

  test('a disc and a rounded rectangle', () => {
    const rounded = roundedRectangle(0, 0, 4, 2, 0.5);
    const result = Boolean2.intersect([rounded], [disc(4, 2, 1)]);
    // Only the rounded corner's quarter of the disc remains: inside the corner arc's circle and the disc.
    const approximate = Boolean2.intersect([rounded], [disc(4, 2, 1)], {
      arcs: { mode: 'approximate', chordTolerance: 1e-6 },
    });
    expect(Math.abs(regionArea(result) - polygonArea(approximate))).toBeLessThan(1e-4);
    expect(result.regions![0]!.sagittas.some((s) => s !== 0)).toBe(true);
  });
});

describe('Boolean2 with arcs: shared and touching boundaries', () => {
  test('A ∪ A = A', () => {
    const shape = roundedRectangle(0, 0, 4, 2, 0.5);
    const result = Boolean2.union([shape, shape]);
    expect(result.regions!.length).toBe(1);
    expect(regionArea(result)).toBeCloseTo(shape.signedArea(), 9);
    expect(result.regions![0]!.segmentCount()).toBe(8); // the fillets and the four sides, merged back
  });

  test('a rounded rectangle and a rectangle sharing a side', () => {
    const rounded = roundedRectangle(0, 0, 4, 2, 0.5);
    const block = new Polygon2([V(0.5, 2), V(3.5, 2), V(3.5, 4), V(0.5, 4)]); // sits on the top side
    const result = Boolean2.union([rounded, block]);
    expect(result.regions!.length).toBe(1);
    expect(regionArea(result)).toBeCloseTo(rounded.signedArea() + 6, 9);
  });

  test('arcs overlapping on the same circle', () => {
    const upper = new ArcPolygon2([V(1, 0), V(-1, 0)], [-1, 0]); // upper half disc
    const right = new ArcPolygon2([V(0, -1), V(0, 1)], [-1, 0]); // right half disc
    expect(regionArea(Boolean2.union([upper, right]))).toBeCloseTo((3 * Math.PI) / 4, 9);
    expect(regionArea(Boolean2.intersect([upper], [right]))).toBeCloseTo(Math.PI / 4, 9);
  });

  test('externally tangent discs stay two regions', () => {
    const result = Boolean2.union([disc(0, 0), disc(2, 0)]);
    expect(result.regions!.length).toBe(2);
    expect(regionArea(result)).toBeCloseTo(2 * Math.PI, 9);
  });

  test('fill rules with an overlapping clockwise loop', () => {
    const outer = ArcPolygon2.fromCircle2(disc(0, 0, 2));
    const inner = ArcPolygon2.fromCircle2(disc(0, 0, 1));
    // Two counter-clockwise discs: nonZero fills both, evenOdd leaves the overlap empty.
    expect(regionArea(Boolean2.union([outer, inner]))).toBeCloseTo(4 * Math.PI, 9);
    expect(regionArea(Boolean2.union([outer, inner], { fillRule: 'evenOdd' }))).toBeCloseTo(3 * Math.PI, 9);
    // A clockwise inner disc is a hole under either rule.
    expect(regionArea(Boolean2.union([outer, inner.inverse()]))).toBeCloseTo(3 * Math.PI, 9);
  });
});

describe('Boolean2 with arcs, approximate', () => {
  test('the union area converges as the tolerance shrinks; mesh works', () => {
    const errors = [1e-2, 1e-3, 1e-4].map((chordTolerance) => {
      const result = Boolean2.union(discs, { arcs: { mode: 'approximate', chordTolerance } });
      expect(result.regions).toBeUndefined();
      return Math.abs(polygonArea(result) - (2 * Math.PI - lens));
    });
    expect(errors[1]!).toBeLessThan(errors[0]!);
    expect(errors[2]!).toBeLessThan(1e-3);
    const meshed = Boolean2.union(discs, { arcs: { mode: 'approximate', chordTolerance: 1e-3 }, mesh: true });
    expect(meshed.triMesh!.triangles.length).toBeGreaterThan(0);
  });

  test('exact and approximate agree', () => {
    const cases: [string, () => Boolean2Result, () => Boolean2Result][] = [
      ['union', () => Boolean2.union(discs), () => Boolean2.union(discs, fine)],
      [
        'intersect',
        () => Boolean2.intersect([discs[0]!], [discs[1]!]),
        () => Boolean2.intersect([discs[0]!], [discs[1]!], fine),
      ],
      [
        'subtract',
        () => Boolean2.subtract([square(-2, 2)], [disc(0, 0), disc(2, 2)]),
        () => Boolean2.subtract([square(-2, 2)], [disc(0, 0), disc(2, 2)], fine),
      ],
    ];
    for (const [name, exact, approximate] of cases) {
      expect(Math.abs(regionArea(exact()) - polygonArea(approximate())), name).toBeLessThan(1e-3);
    }
  });
});
const fine = { arcs: { mode: 'approximate', chordTolerance: 1e-5 } } as const;

describe('Boolean2 arcs contract', () => {
  test('a mesh needs the approximate mode', () => {
    expect(() => Boolean2.union(discs, { mesh: true })).toThrow(/approximate/);
    expect(() => Boolean2.union(discs, { arcs: { mode: 'approximate', chordTolerance: 0 } })).toThrow(/chordTolerance/);
  });

  test('inputs without arcs keep the polygon path', () => {
    const straight = ArcPolygon2.fromPolygon(square(0, 2));
    const result = Boolean2.union([straight, square(1, 3)]);
    expect(result.regions).toBeUndefined();
    expect(polygonArea(result)).toBeCloseTo(7, 9);
  });
});

describe('Boolean2 with arcs: exact agrees with a fine approximation on random inputs', () => {
  // Seeded: discs, rounded rectangles and polygons, some reversed into holes, some clips half-planes.
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shape = () => {
    const kind = Math.floor(random() * 3);
    if (kind === 0) return disc(random() * 4, random() * 4, 0.5 + random() * 1.5);
    if (kind === 1) {
      const [x, y] = [random() * 3, random() * 3];
      const rounded = roundedRectangle(0, 0, 1 + random() * 2, 1 + random() * 2, 0.1 + random() * 0.4);
      return rounded.transform(Mat3.translation(x, y));
    }
    const n = 3 + Math.floor(random() * 3);
    const [cx, cy, r] = [random() * 4, random() * 4, 0.8 + random()];
    return new Polygon2(
      Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * 2 * Math.PI + random() * 0.5;
        return V(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }),
    );
  };
  const approximate = { arcs: { mode: 'approximate', chordTolerance: 1e-5 } } as const;

  test('40 configurations, three operations each', () => {
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const a = shape();
      const b0 = shape();
      const b = random() < 0.2 && b0.type !== 'Circle2' ? b0.inverse() : b0;
      const c = random() < 0.2 ? new InfiniteLine2(V(random() * 4, random() * 4), V(1, random() - 0.5)) : shape();
      const both = [b, c];
      const shapes = c.type === 'InfiniteLine2' ? [a, b] : [a, b, c];
      const pairs: [Boolean2Result, Boolean2Result][] = [
        [Boolean2.union(shapes), Boolean2.union(shapes, approximate)],
        [Boolean2.intersect([a], both), Boolean2.intersect([a], both, approximate)],
        [Boolean2.subtract([a], both), Boolean2.subtract([a], both, approximate)],
      ];
      for (const [exact, approx] of pairs) {
        const area = (r: Boolean2Result) => regionArea(r) + polygonArea(r);
        worst = Math.max(worst, Math.abs(area(exact) - area(approx)));
      }
    }
    expect(worst).toBeLessThan(1e-3);
  }, 30_000);
});

describe('ArcWindingIndex', () => {
  test('matches summed windingNumber, including on chords, arcs and vertices', () => {
    const loops = [
      ArcPolygon2.fromCircle2(disc(0, 0, 2)),
      roundedRectangle(0, 0, 4, 2, 0.5),
      new ArcPolygon2([V(-1, -1), V(3, -1), V(3, 3), V(-1, 3)], [0, -0.8, 0.6, 0]).inverse(),
      new ArcPolygon2([V(0, 0), V(2, 0)], [0, -1]),
    ];
    const index = new ArcWindingIndex([loops.slice(0, 2), loops.slice(2)]);
    let seed = 3;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const probes: Vec2[] = Array.from({ length: 2000 }, () => V(random() * 8 - 3, random() * 8 - 3));
    for (const loop of loops) {
      probes.push(...loop.vertices);
      for (const segment of loop.segments()) probes.push(segment.evaluate(0.5), Vec2.center(segment.from, segment.to));
    }
    for (const point of probes) {
      const expected = [
        loops[0]!.windingNumber(point) + loops[1]!.windingNumber(point),
        loops[2]!.windingNumber(point) + loops[3]!.windingNumber(point),
      ];
      expect([...index.winding(point)]).toEqual(expected);
    }
  });
});
