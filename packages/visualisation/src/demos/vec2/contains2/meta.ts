import type { VisualisationMeta } from '../../../core/meta';

export const contains2VisualisationMeta: VisualisationMeta = {
  id: 'contains2',
  label: 'Contains2',
  title: 'Contains2',
  description:
    'Translucent blue = container interior. Guest geometry in orange; query points are green (inside) or red (outside). Rows: points → segments → circles → curves → unbounded → meshes → complex mesh containers → complex mesh guests (circle, polygon, half-plane).',
  legend: [
    { color: '#4da3ff', label: 'Container interior' },
    { color: '#ffb347', label: 'Guest', shape: 'line' },
    { color: '#7dff7d', label: 'Point inside' },
    { color: '#ff5c5c', label: 'Point outside' },
  ],
};
