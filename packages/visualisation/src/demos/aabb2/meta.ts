import type { VisualisationMeta } from '../../core/meta';

export const aabb2VisualisationMeta: VisualisationMeta = {
  id: 'aabb2',
  label: 'Aabb2',
  title: 'Aabb2',
  description:
    'Orange = source geometry; green = axis-aligned bounding box (finite display for unbounded bounds). Rows: finite shapes → rays/lines → unions. Rays/lines may use definitionGeometry for finite definition segments.',
  legend: [
    { color: '#ffb347', label: 'Geometry', shape: 'line' },
    { color: '#7dff7d', label: 'Aabb2', shape: 'line' },
  ],
};
