'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Interval2 } from '@dirty-geometry/vec2/bounds/interval2';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';
import { evaluateInterval2Scenario, formatCall, formatResult, interval2ComplementScenarios, interval2LongestScenarios, interval2MergeScenarios, type Interval2Scenario } from '@dirty-geometry/vec2/examples/interval2/scenarios';

const INPUT_COLOR = '#8a93a5';
const MERGED_COLOR = '#7dff7d';
const GAP_COLOR = '#ff6b6b';
const LONGEST_COLOR = '#ffb347';
const DOMAIN_COLOR = '#3a4150';

/** Vertical spacing between stacked interval bars, in scenario units. */
const LANE_GAP = 0.22;

export const interval2VisualisationMeta: VisualisationMeta = {
  id: 'interval2',
  label: 'Interval2',
  title: 'Interval2 sets',
  description:
    'Grey = input intervals stacked on their own lanes, above the domain line. Below it: green = Interval2.merge, red = Interval2.complement, orange = Interval2.longest. Rows: merge → complement → longest. A cell naming an ε passes that Epsilon to every call in its chain; the default is Epsilon.preferIn.',
  legend: [
    { color: INPUT_COLOR, label: 'Input intervals', shape: 'line' },
    { color: MERGED_COLOR, label: 'merge', shape: 'line' },
    { color: GAP_COLOR, label: 'complement', shape: 'line' },
    { color: LONGEST_COLOR, label: 'longest', shape: 'line' },
  ],
};

const interval2ScenarioRows = [
  interval2MergeScenarios,
  interval2ComplementScenarios,
  interval2LongestScenarios,
] as const;

type Bar = { interval: Interval2; lane: number; color: string; width: number };

/** Input lanes above the domain line, result lanes below it. */
function scenarioBars(scenario: Interval2Scenario): Bar[] {
  const { merged, gaps, longest } = evaluateInterval2Scenario(scenario);
  const bars: Bar[] = scenario.inputs.map((interval, index) => ({
    interval,
    lane: (scenario.inputs.length - index) * LANE_GAP,
    color: INPUT_COLOR,
    width: 2,
  }));

  if (scenario.section === 'merge') {
    bars.push(...merged.map((interval) => ({ interval, lane: -LANE_GAP, color: MERGED_COLOR, width: 4 })));
  } else {
    bars.push(...gaps.map((interval) => ({ interval, lane: -LANE_GAP, color: GAP_COLOR, width: 4 })));
  }

  if (scenario.section === 'longest' && longest) {
    bars.push({ interval: longest, lane: -2 * LANE_GAP, color: LONGEST_COLOR, width: 4 });
  }

  return bars;
}

function Interval2ScenarioVisual({ scenario, offset }: { scenario: Interval2Scenario; offset: Vec2 }) {
  const result = evaluateInterval2Scenario(scenario);
  const bars = useMemo(() => scenarioBars(scenario), [scenario]);

  const fit = useMemo(() => {
    const points = bars.flatMap((bar) => [new Vec2(bar.interval.min, bar.lane), new Vec2(bar.interval.max, bar.lane)]);
    points.push(new Vec2(result.within.min, 0), new Vec2(result.within.max, 0));
    return fitPointsToFrame(points);
  }, [bars, result.within]);

  const barPoints = (interval: Interval2, lane: number): [number, number, number][] => [
    vec2ToTuple(fit(new Vec2(interval.min, lane)), offset),
    vec2ToTuple(fit(new Vec2(interval.max, lane)), offset),
  ];

  return (
    <group>
      <Line points={frameCorners(offset)} color={DOMAIN_COLOR} lineWidth={1} />
      <Line points={barPoints(result.within, 0)} color={DOMAIN_COLOR} lineWidth={1.5} />

      {bars.map((bar, index) => (
        <Line key={`bar-${index}`} points={barPoints(bar.interval, bar.lane)} color={bar.color} lineWidth={bar.width} />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-36 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{formatCall(scenario)}</div>
          <div className='text-green-300/90'>{formatResult(scenario, result)}</div>
        </div>
      </Html>
    </group>
  );
}

export function Interval2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={interval2ScenarioRows}
      columns={Math.max(...interval2ScenarioRows.map((row) => row.length))}
      renderCell={(scenario, offset) => <Interval2ScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default Interval2Visualisation;
