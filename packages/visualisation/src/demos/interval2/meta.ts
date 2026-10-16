import type { VisualisationMeta } from '../../core/meta';

export const INPUT_COLOR = '#8a93a5';
export const MERGED_COLOR = '#7dff7d';
export const GAP_COLOR = '#ff6b6b';
export const LONGEST_COLOR = '#ffb347';

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
