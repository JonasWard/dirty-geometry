import type { VisualisationMeta } from '../../../core/meta';

export const cdtVisualisationMeta: VisualisationMeta = {
  id: 'constrained-delaunay',
  label: 'Constrained Delaunay',
  title: 'Constrained Delaunay',
  description:
    'Rows: basic → shape collections → large / self-intersecting cases. Blue = triangulation; purple = input constraints (crossings are split automatically).',
  legend: [
    { color: '#4da3ff', label: 'Triangle edge', shape: 'line' },
    { color: '#c77dff', label: 'Constraint (input)', shape: 'line' },
    { color: '#ffb347', label: 'Vertex' },
  ],
};
