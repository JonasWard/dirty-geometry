import type { VisualisationMeta } from '../../../core/meta';

export const minkowski2VisualisationMeta: VisualisationMeta = {
  id: 'minkowski2',
  label: 'Minkowski2',
  title: 'Minkowski sums',
  description:
    'Every point of one shape plus every point of the other. The first row sums convex polygons edge by edge; the second grows shapes by a disc, with exact arcs at the corners; the third sums non-convex shapes and holes by splitting them into convex pieces; the last shows A ⊕ (−B) and erosion A ⊖ B (the points where B still fits inside A). Each label shows the area and how long it took in your browser.',
  legend: [
    { color: '#ffb347', label: 'A', shape: 'line' },
    { color: '#c77dff', label: 'B', shape: 'line' },
    { color: '#7dff7d', label: 'Result', shape: 'line' },
    { color: '#7dff7d', label: 'Result interior' },
    { color: '#ff7ad9', label: 'Hole', shape: 'line' },
  ],
};
