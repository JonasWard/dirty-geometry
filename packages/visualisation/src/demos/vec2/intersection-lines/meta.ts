import type { VisualisationMeta } from '../../../core/meta';

export const intersectionLines2VisualisationMeta: VisualisationMeta = {
  id: 'intersection-lines',
  label: 'IntersectionLines2',
  title: 'IntersectionLines2',
  description: 'Each cell clips to [-2, 2] with a 1 unit gap. Sections: axis-aligned, angled, random.',
  legend: [
    { color: '#4da3ff', label: 'First geometry', shape: 'line' },
    { color: '#ffb347', label: 'Second geometry', shape: 'line' },
    { color: '#7dff7d', label: 'Intersection' },
    { color: '#ff5c5c', label: 'No intersection' },
  ],
};
