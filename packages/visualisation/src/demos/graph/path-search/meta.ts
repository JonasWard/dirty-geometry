import type { VisualisationMeta } from '../../../core/meta';
import { GRAPH_LEGEND_COLORS as C } from '../shared/legend-colors';

export const pathSearchVisualisationMeta: VisualisationMeta = {
  id: 'path-search',
  label: 'Path search',
  title: 'UndirectedGraph2D path search',
  description:
    'One 6 × 4 lattice, start bottom-left, goal bottom-right. The three middle-column edges in the lower rows weigh 9. Top row: BFS, Dijkstra and A* side by side. Bottom row: blocked edges, a via node, a forced via edge and a forced edge that is blocked.',
  legend: [
    { color: C.result, label: 'Path', shape: 'line' },
    { color: C.input, label: 'Slow (weight 9) / forced edge', shape: 'line' },
    { color: C.blocked, label: 'Blocked edge', shape: 'line' },
    { color: C.start, label: 'Start' },
    { color: C.goal, label: 'Goal' },
    { color: C.via, label: 'Via node' },
  ],
};
