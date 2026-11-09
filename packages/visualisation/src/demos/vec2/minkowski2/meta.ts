import type { VisualisationMeta } from '../../../core/meta';

export const minkowski2VisualisationMeta: VisualisationMeta = {
  id: 'minkowski2',
  label: 'Minkowski2',
  title: 'Minkowski sums',
  description:
    'Every point of one shape plus every point of the other. The first row sums convex polygons edge by edge; the second grows shapes by a disc, with exact arcs at the corners; the third sums non-convex shapes and holes by splitting them into convex pieces; the fourth shows A ⊕ (−B) and erosion A ⊖ B (the points where B still fits inside A). The rows below show how non-convex shapes are handled, in three steps. 1, convex pieces (ConvexDecomposition2): the shape is triangulated (constrained Delaunay, triangles inside the shape only, so holes stay empty), then neighbouring triangles are merged across a shared edge whenever both ends of that edge still turn convex. The L becomes two rectangles, the comb its four teeth and its base, the holed square four pieces around the hole. 2, pair sums: every piece of A is summed with every piece of B, which is easy because both are convex. 3, union: those sums are united into the result. A disc sum of a non-convex shape instead unites the shape with a capsule around every edge. Each label shows the area and how long it took in your browser.',
  legend: [
    { color: '#ffb347', label: 'A', shape: 'line' },
    { color: '#c77dff', label: 'B', shape: 'line' },
    { color: '#7dff7d', label: 'Result', shape: 'line' },
    { color: '#7dff7d', label: 'Result interior' },
    { color: '#ff7ad9', label: 'Hole', shape: 'line' },
    { color: '#4cc9f0', label: 'Convex piece / piece sum / capsule' },
  ],
};
