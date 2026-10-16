import { Interval2 } from '../../src/bounds/interval2';
import { Epsilon } from '../../src/core/epsilon';

export type Interval2ScenarioSection = 'merge' | 'complement' | 'longest';

export type Interval2Scenario = {
  name: string;
  section: Interval2ScenarioSection;
  inputs: readonly Interval2[];
  /** Domain for `complement`; defaults to `Interval2.unit`. */
  within?: Interval2;
  /** Non-default slack, shown in the caption. */
  slack?: Epsilon;
};

export type Interval2ScenarioResult = {
  within: Interval2;
  merged: Interval2[];
  gaps: Interval2[];
  longest: Interval2 | null;
};

export function evaluateInterval2Scenario(scenario: Interval2Scenario): Interval2ScenarioResult {
  const within = scenario.within ?? Interval2.unit;
  const slack = scenario.slack ?? Epsilon.preferIn;
  const merged = Interval2.merge(scenario.inputs, slack);
  const gaps = Interval2.complement(scenario.inputs, within, slack);

  return {
    within,
    merged,
    gaps,
    longest: Interval2.longest(scenario.section === 'longest' ? gaps : merged, slack),
  };
}

const round = (value: number): string => `${Math.round(value * 100) / 100}`;

export function formatInterval(interval: Interval2): string {
  return `[${round(interval.min)}, ${round(interval.max)}]`;
}

export function formatIntervals(intervals: readonly Interval2[]): string {
  return intervals.length === 0 ? '∅' : intervals.map(formatInterval).join(' ');
}

/** Caption for the call the cell demonstrates. */
export function formatCall(scenario: Interval2Scenario): string {
  const slack = scenario.slack ? `, ε ${round(scenario.slack.value)}` : '';
  if (scenario.section === 'merge') return `merge(${scenario.inputs.length}${slack})`;
  if (scenario.section === 'complement') {
    const within = scenario.within ? `, ${formatInterval(scenario.within)}` : '';
    return `complement(${scenario.inputs.length}${within}${slack})`;
  }
  return `longest(complement(${scenario.inputs.length})${slack})`;
}

export function formatResult(scenario: Interval2Scenario, result: Interval2ScenarioResult): string {
  if (scenario.section === 'merge') return formatIntervals(result.merged);
  if (scenario.section === 'complement') return formatIntervals(result.gaps);
  return result.longest ? formatInterval(result.longest) : 'null';
}

export const interval2MergeScenarios: Interval2Scenario[] = [
  {
    name: 'Disjoint',
    section: 'merge',
    inputs: [new Interval2(0, 0.3), new Interval2(0.6, 1)],
  },
  {
    name: 'Overlapping',
    section: 'merge',
    inputs: [new Interval2(0, 0.55), new Interval2(0.4, 1)],
  },
  {
    name: 'Unsorted input',
    section: 'merge',
    inputs: [new Interval2(0.7, 1), new Interval2(0, 0.2), new Interval2(0.35, 0.8)],
  },
  {
    name: 'Swallowed span',
    section: 'merge',
    inputs: [new Interval2(0, 1), new Interval2(0.4, 0.6)],
  },
  {
    name: 'Touching · default ε',
    section: 'merge',
    inputs: [new Interval2(0, 0.5), new Interval2(0.5, 1)],
  },
  {
    name: 'Touching · wide ε',
    section: 'merge',
    inputs: [new Interval2(0, 0.4), new Interval2(0.6, 1)],
    slack: Epsilon.custom(0.25),
  },
];

export const interval2ComplementScenarios: Interval2Scenario[] = [
  {
    name: 'Gap in the middle',
    section: 'complement',
    inputs: [new Interval2(0, 0.3), new Interval2(0.7, 1)],
  },
  {
    name: 'Fully covered',
    section: 'complement',
    inputs: [new Interval2(0, 0.6), new Interval2(0.6, 1)],
  },
  {
    name: 'Nothing covered',
    section: 'complement',
    inputs: [],
  },
  {
    name: 'Clipped to domain',
    section: 'complement',
    inputs: [new Interval2(-0.4, 0.35)],
  },
  {
    name: 'Custom domain',
    section: 'complement',
    inputs: [new Interval2(4, 6)],
    within: new Interval2(2, 10),
  },
  {
    name: 'Seam bridged by ε',
    section: 'complement',
    inputs: [new Interval2(0, 0.45), new Interval2(0.55, 1)],
    slack: Epsilon.custom(0.25),
  },
];

export const interval2LongestScenarios: Interval2Scenario[] = [
  {
    name: 'Widest free span',
    section: 'longest',
    inputs: [new Interval2(0.15, 0.25), new Interval2(0.7, 0.78)],
  },
  {
    name: 'Tie keeps the first',
    section: 'longest',
    inputs: [new Interval2(0.25, 0.4), new Interval2(0.6, 0.75)],
  },
  {
    name: 'No free span',
    section: 'longest',
    inputs: [new Interval2(0, 1)],
  },
  {
    name: 'ε bridges both seams',
    section: 'longest',
    inputs: [new Interval2(0, 0.2), new Interval2(0.3, 0.35), new Interval2(0.45, 1)],
    slack: Epsilon.custom(0.12),
  },
];
