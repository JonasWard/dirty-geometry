import type { VisualisationMeta } from '../../../core/meta';

export const curveVisualisationMeta: VisualisationMeta = {
  id: 'curves',
  label: 'Polyline / Polygon',
  title: 'Polyline2 / Polygon2',
  description:
    'Content is scaled into each [-2, 2] frame with margin. Hover overlapping samples to fan them apart and inspect their source.',
  legend: [
    { color: '#4da3ff', label: 'Curve', shape: 'line' },
    { color: '#5ce1ff', label: 'evaluate(t)' },
    { color: '#ffb347', label: 'evaluateAtLength(s)' },
    { color: '#ff5c5c', label: 'Query point' },
    { color: '#7dff7d', label: 'Closest point' },
    { color: '#c77dff', label: 'Closest (+tolerance)' },
  ],
};
