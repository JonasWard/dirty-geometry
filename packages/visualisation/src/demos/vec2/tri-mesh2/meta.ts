import type { VisualisationMeta } from '../../../core/meta';

export const triMesh2VisualisationMeta: VisualisationMeta = {
  id: 'tri-mesh2',
  label: 'TriMesh2',
  title: 'TriMesh2 containment',
  description:
    'Sample grid colored by TriMesh2.containsPoint. Green = inside, red = outside. Rows: simple shapes → multi-hole plates → irregular footprints. Columns compare slack: preferIn counts boundary as inside; preferOut is strict; larger |ε| widens the boundary band.',
  legend: [
    { color: '#4da3ff', label: 'Mesh edge', shape: 'line' },
    { color: '#4da3ff', label: 'Triangle fill' },
    { color: '#7dff7d', label: 'Point inside' },
    { color: '#ff5c5c', label: 'Point outside' },
  ],
};
