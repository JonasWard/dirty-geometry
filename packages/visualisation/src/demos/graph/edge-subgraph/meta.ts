import type { VisualisationMeta } from '../../../core/meta';
import { GRAPH_LEGEND_COLORS as C } from '../shared/legend-colors';

export const edgeSubgraphVisualisationMeta: VisualisationMeta = {
  id: 'edge-subgraph',
  label: 'Edge subsets',
  title: 'Edge-subset helpers',
  description:
    'Helpers that work on a subset of a graph’s edges. Rows: simple-cycle checks and cycle search → peelSpurs next to twoCore → connected components and leaf-to-leaf paths (shortest and longest) through a 3 × 3 lattice.',
  legend: [
    { color: C.input, label: 'Input subset', shape: 'line' },
    { color: C.result, label: 'Result', shape: 'line' },
    { color: C.groups[0], label: 'Component colours', shape: 'line' },
    { color: C.leaf, label: 'Leaf (degree 1)' },
    { color: C.junction, label: 'Junction (degree > 2)' },
  ],
};
