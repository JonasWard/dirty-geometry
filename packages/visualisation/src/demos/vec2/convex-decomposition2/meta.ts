import type { VisualisationMeta } from '../../../core/meta';

export const convexDecomposition2VisualisationMeta: VisualisationMeta = {
  id: 'convex-decomposition2',
  label: 'ConvexDecomposition2',
  title: 'Convex decomposition',
  description:
    'How Minkowski2.sum handles non-convex shapes, one example per row in four steps. 0, triangles: the shape is triangulated (constrained Delaunay, triangles inside the shape only, so holes stay empty); each triangle is tinted with the colour of the piece it ends up in. 1, convex pieces (ConvexDecomposition2): neighbouring triangles are merged across a shared edge whenever both ends of that edge still turn convex, so the L becomes two rectangles, the comb its four teeth and its base, and the holed square four pieces around the hole. A shape that is already convex, like the triangle, stays one piece. 2, pair sums: every piece of A is summed with every piece of B, which is easy because both are convex. 3, union: the sums are united into the result.',
  legend: [
    { color: '#ffb347', label: 'A', shape: 'line' },
    { color: '#c77dff', label: 'B', shape: 'line' },
    { color: '#e8ecf4', label: 'Triangle', shape: 'line' },
    { color: '#4cc9f0', label: 'Convex piece / piece sum' },
    { color: '#7dff7d', label: 'Result', shape: 'line' },
    { color: '#ff7ad9', label: 'Hole', shape: 'line' },
  ],
};
