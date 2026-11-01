/** Boolean2 on curved shapes: complex, many-crossing inputs, exact unless a scenario asks otherwise. */
import { Vec2 } from '../../src/core/vec2';
import { ArcPolyline2 } from '../../src/geometry/curves/arc-polyline2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import {
  Boolean2,
  type Boolean2Clip,
  type Boolean2Options,
  type Boolean2Result,
  type Boolean2Shape,
} from '../../src/operations/boolean2';
import { annulus, disc, flower, pill, roundedRectangle, scallop, wallBand } from '../arc-shapes';

export type ArcBooleanSection = 'union' | 'intersect' | 'subtract';

export type ArcBooleanScenario = {
  name: string;
  section: ArcBooleanSection;
  inputs: Boolean2Shape[];
  clips?: Boolean2Clip[];
  options?: Boolean2Options;
};

const V = (x: number, y: number) => new Vec2(x, y);

const ringOfDiscs = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * 2 * Math.PI;
  return disc(2 * Math.cos(angle), 2 * Math.sin(angle), 1.1);
});

const flowerBar = { flower: flower(V(0, 0), 6, 2, 0.6), bar: roundedRectangle(-3.5, -0.6, 7, 1.2, 0.5) };

const walls = [
  wallBand(new ArcPolyline2([V(-3, 0), V(3, 0)], [0.8]), 0.5),
  wallBand(new ArcPolyline2([V(0.2, -2.5), V(0.5, 2.5)], [-0.6]), 0.5),
  wallBand(new ArcPolyline2([V(-2.2, 2), V(0, 0.4), V(2.5, 2.2)], [0.3, -0.3]), 0.4),
];

export const arcUnionScenarios: ArcBooleanScenario[] = [
  { name: 'Ring of six discs', section: 'union', inputs: ringOfDiscs },
  { name: 'Flower ∪ rounded bar', section: 'union', inputs: [flowerBar.flower, flowerBar.bar] },
  { name: 'Curved walls at a junction', section: 'union', inputs: walls },
  {
    name: 'Pill chain',
    section: 'union',
    inputs: [
      pill(V(0, 0), V(2, 1), 0.5),
      pill(V(1.5, 1.2), V(3.5, 0.2), 0.5),
      pill(V(3, 0), V(5, 1), 0.5),
      pill(V(4.5, 1.2), V(6.5, 0.4), 0.5),
    ],
  },
];

export const arcIntersectScenarios: ArcBooleanScenario[] = [
  {
    name: 'Flower ∩ scallop',
    section: 'intersect',
    inputs: [flower(V(0, 0), 6, 2, 0.6)],
    clips: [scallop(V(0.8, 0.5), 5, 2.2, 0.5, 0.4)],
  },
  {
    name: 'Annulus ∩ rounded block',
    section: 'intersect',
    inputs: annulus(0, 0, 2.5, 1.4),
    clips: [roundedRectangle(-2, -2.2, 5, 4, 0.6)],
  },
  {
    name: 'Curved wall ∩ flower',
    section: 'intersect',
    inputs: [walls[0]!],
    clips: [flower(V(0, 0.6), 7, 1.8, 0.5)],
  },
  {
    name: 'Flower ∩ two half-planes',
    section: 'intersect',
    inputs: [flower(V(0, 0), 8, 2.2, 0.5)],
    clips: [new InfiniteLine2(V(0, -0.5), V(1, 0.6)), new InfiniteLine2(V(0, 0.5), V(-1, 0.8))],
  },
];

export const arcSubtractScenarios: ArcBooleanScenario[] = [
  {
    name: 'Rounded slab − wave of discs',
    section: 'subtract',
    inputs: [roundedRectangle(0, 0, 8, 3, 0.8)],
    clips: [disc(1, 0.2, 0.6), disc(2.6, 1.5, 0.5), disc(4, 2.9, 0.7), disc(5.6, 1.5, 0.5), disc(7.2, 2.6, 0.6)],
  },
  {
    name: 'Block − curved wall',
    section: 'subtract',
    inputs: [new Polygon2([V(0, 0), V(6, 0), V(6, 4), V(0, 4)])],
    clips: [wallBand(new ArcPolyline2([V(-1, 1), V(3, 2.5), V(7, 1.5)], [0.5, -0.5]), 0.8)],
  },
  {
    name: 'Annulus − flower',
    section: 'subtract',
    inputs: annulus(0, 0, 2.5, 1.2),
    clips: [flower(V(1.8, 0), 5, 1.3, 0.4)],
  },
  {
    name: 'Rounded block − holed scallop',
    section: 'subtract',
    inputs: [roundedRectangle(-3, -2.5, 6, 5, 1)],
    clips: [scallop(V(0, 0), 6, 1.9, 0.4), disc(0, 0, 0.7).inverse()],
  },
];

export const arcModeScenarios: ArcBooleanScenario[] = [
  { name: 'Flower ∪ bar · exact', section: 'union', inputs: [flowerBar.flower, flowerBar.bar] },
  {
    name: 'Flower ∪ bar · approximate 0.05',
    section: 'union',
    inputs: [flowerBar.flower, flowerBar.bar],
    options: { arcs: { mode: 'approximate', chordTolerance: 0.05 } },
  },
  {
    name: 'Flower ∪ bar · approximate 0.005',
    section: 'union',
    inputs: [flowerBar.flower, flowerBar.bar],
    options: { arcs: { mode: 'approximate', chordTolerance: 0.005 } },
  },
];

/** Seeded, so the demo and its tests see the same shapes. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
}

function flowerBlockGrid(k: number): Boolean2Shape[] {
  const shapes: Boolean2Shape[] = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      shapes.push(
        (i + j) % 2
          ? roundedRectangle(i * 1.6, j * 1.6, 2, 2, 0.4)
          : flower(V(i * 1.6 + 1, j * 1.6 + 1), 6, 1.1, 0.3, (i * 0.7 + j) % 1),
      );
    }
  }
  return shapes;
}

function wallLattice(count: number, length: number): Boolean2Shape[] {
  const walls: Boolean2Shape[] = [];
  for (let i = 0; i < count; i++) {
    const at = ((i + 0.5) / count) * length;
    walls.push(
      pill(V(0, at), V(length, at + (i % 3) * 0.3), 0.12),
      pill(V(at, 0), V(at - (i % 2) * 0.4, length), 0.12),
    );
  }
  return walls;
}

function randomDiscs(count: number, size: number, seed: number, minRadius: number, maxRadius: number) {
  const random = seeded(seed);
  return Array.from({ length: count }, () =>
    disc(random() * size, random() * size, minRadius + random() * (maxRadius - minRadius)),
  );
}

/** Curved streets: wall bands along gently curving centrelines, crossing each other. */
function curvedStreets(count: number, size: number): Boolean2Shape[] {
  const random = seeded(11);
  return Array.from({ length: count }, (_, i) => {
    const horizontal = i % 2 === 0;
    const at = ((Math.floor(i / 2) + 0.5) / Math.ceil(count / 2)) * size;
    const ends = horizontal
      ? [V(-0.5, at), V(size / 2, at + random() - 0.5), V(size + 0.5, at)]
      : [V(at, -0.5), V(at + random() - 0.5, size / 2), V(at, size + 0.5)];
    return wallBand(new ArcPolyline2(ends, [0.6 * (random() - 0.5), 0.6 * (random() - 0.5)]), 0.35);
  });
}

/** Many shapes at once: the exact path at block and district scale. */
export const arcManyScenarios: ArcBooleanScenario[] = [
  { name: '64 flowers and blocks', section: 'union', inputs: flowerBlockGrid(8) },
  { name: 'Lattice of 40 walls', section: 'union', inputs: wallLattice(20, 12) },
  { name: '150 random discs', section: 'union', inputs: randomDiscs(150, 10, 5, 0.2, 0.7) },
  {
    name: 'Slab − 80 random discs',
    section: 'subtract',
    inputs: [roundedRectangle(0, 0, 10, 10, 1.5)],
    clips: randomDiscs(80, 10, 9, 0.15, 0.55),
  },
  {
    name: '16 curved streets ∩ disc',
    section: 'intersect',
    inputs: curvedStreets(16, 10),
    clips: [disc(5, 5, 4.6)],
  },
];

export const arcBooleanScenarioRows = [
  arcUnionScenarios,
  arcIntersectScenarios,
  arcSubtractScenarios,
  arcModeScenarios,
  arcManyScenarios,
] as const;

export const arcBooleanScenarios: ArcBooleanScenario[] = arcBooleanScenarioRows.flat();

/** Run a scenario; approximate ones also return their mesh, exact ones their regions. */
export function evaluateArcBooleanScenario(
  scenario: ArcBooleanScenario,
  override: Boolean2Options = {},
): Boolean2Result {
  const options: Boolean2Options = { ...scenario.options, ...override };
  if (options.arcs?.mode === 'approximate') options.mesh = true;
  if (scenario.section === 'union') return Boolean2.union(scenario.inputs, options);
  if (scenario.section === 'intersect') return Boolean2.intersect(scenario.inputs, scenario.clips ?? [], options);
  return Boolean2.subtract(scenario.inputs, scenario.clips ?? [], options);
}
