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

export const arcBooleanScenarioRows = [
  arcUnionScenarios,
  arcIntersectScenarios,
  arcSubtractScenarios,
  arcModeScenarios,
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
