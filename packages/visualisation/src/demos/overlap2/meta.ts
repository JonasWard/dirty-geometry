import type { VisualisationMeta } from '../../core/meta';

export const overlap2VisualisationMeta: VisualisationMeta = {
  id: 'overlap2',
  label: 'Overlap2',
  title: 'Overlap2',
  description:
    'Blue and orange are the two geometries under test. Green label = overlap; red = disjoint. Last row pairs preferIn (touch counts) vs preferOut (strict interior only) for boundary contact.',
  legend: [
    { color: '#4da3ff', label: 'Geometry A', shape: 'line' },
    { color: '#ffb347', label: 'Geometry B', shape: 'line' },
    { color: '#7dff7d', label: 'Overlaps' },
    { color: '#ff5c5c', label: 'Disjoint' },
  ],
};
