import type { VisualisationMeta } from '../../core/meta';

export const boolean2VisualisationMeta: VisualisationMeta = {
  id: 'boolean2',
  label: 'Boolean2',
  title: 'Boolean2',
  description:
    'Orange = subject polygons. Purple = clip (half-plane line or polygon). Green = boolean result (filtered CDT mesh). Union merges via non-zero winding; intersect / subtract clip against one or many half-planes and/or polygons.',
  legend: [
    { color: '#ffb347', label: 'Subject polygon', shape: 'line' },
    { color: '#c77dff', label: 'Clip geometry', shape: 'line' },
    { color: '#7dff7d', label: 'Result interior' },
  ],
};
