import type { VisualisationMeta } from '../../../core/meta';
import { HALF_EDGE_COLORS as C } from './colors';

export const halfEdgeVisualisationMeta: VisualisationMeta = {
  id: 'half-edge',
  label: 'Half-edge mesh',
  title: 'HalfEdgeGraph from n-gons',
  description:
    'createFromNGon builds a half-edge structure from counter-clockwise faces. Each half-edge is drawn inside its face. The numbers give iterateVertex order around the red vertex: counter-clockwise, starting at the clockwise-most edge on a boundary.',
  legend: [
    { color: C.interior, label: 'Half-edge with a twin', shape: 'line' },
    { color: C.boundary, label: 'Boundary half-edge (twin = null)', shape: 'line' },
    { color: C.fan, label: 'Outgoing fan, numbered', shape: 'line' },
    { color: C.pick, label: 'Picked vertex' },
  ],
};
