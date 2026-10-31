import type { VisualisationMeta } from '../../../core/meta';

export const arcBoolean2VisualisationMeta: VisualisationMeta = {
  id: 'arc-boolean2',
  label: 'Boolean2 · arcs',
  title: 'Boolean2 with arcs',
  description:
    'Unions, intersections and subtractions of curved shapes: discs, flowers, scallops, rounded blocks, pills and curved wall bands. Results are exact (they keep their arcs) unless a cell says approximate; the last row shows one case exact and with two chord tolerances. Dots mark where the result boundary changes from one curve to the next.',
  legend: [
    { color: '#ffb347', label: 'Subject', shape: 'line' },
    { color: '#c77dff', label: 'Clip', shape: 'line' },
    { color: '#7dff7d', label: 'Result', shape: 'line' },
    { color: '#7dff7d', label: 'Result interior' },
    { color: '#ff7ad9', label: 'Hole', shape: 'line' },
  ],
};
