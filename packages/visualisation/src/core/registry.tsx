'use client';

import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { findDemo, visualisationMetas, type DemoMeta } from '../meta';

type DemoModule = Promise<{ default: ComponentType }>;
const load = <M,>(module: Promise<M>, pick: (module: M) => ComponentType): DemoModule =>
  module.then((loaded) => ({ default: pick(loaded) }));

/** Keyed `<library>/<id>`. Each demo's component (and its three.js code) loads when the demo is first shown. */
const components: Record<string, LazyExoticComponent<ComponentType>> = {
  'vec2/curves': lazy(() => load(import('../demos/vec2/curves/CurveVisualisation'), (m) => m.CurveVisualisation)),
  'vec2/intersection-lines': lazy(() =>
    load(
      import('../demos/vec2/intersection-lines/IntersectionLines2Visualisation'),
      (m) => m.IntersectionLines2Visualisation,
    ),
  ),
  'vec2/constrained-delaunay': lazy(() =>
    load(
      import('../demos/vec2/constrained-delaunay/ConstrainedDelaunayVisualisation'),
      (m) => m.ConstrainedDelaunayVisualisation,
    ),
  ),
  'vec2/contains2': lazy(() =>
    load(import('../demos/vec2/contains2/Contains2Visualisation'), (m) => m.Contains2Visualisation),
  ),
  'vec2/tri-mesh2': lazy(() =>
    load(import('../demos/vec2/tri-mesh2/TriMesh2Visualisation'), (m) => m.TriMesh2Visualisation),
  ),
  'vec2/overlap2': lazy(() =>
    load(import('../demos/vec2/overlap2/Overlap2Visualisation'), (m) => m.Overlap2Visualisation),
  ),
  'vec2/boolean2': lazy(() =>
    load(import('../demos/vec2/boolean2/Boolean2Visualisation'), (m) => m.Boolean2Visualisation),
  ),
  'vec2/aabb2': lazy(() => load(import('../demos/vec2/aabb2/Aabb2Visualisation'), (m) => m.Aabb2Visualisation)),
  'vec2/interval2': lazy(() =>
    load(import('../demos/vec2/interval2/Interval2Visualisation'), (m) => m.Interval2Visualisation),
  ),
  'vec2/grid2': lazy(() => load(import('../demos/vec2/grid2/Grid2Visualisation'), (m) => m.Grid2Visualisation)),
  'vec2/grid2-rectangle-detection': lazy(() =>
    load(
      import('../demos/vec2/grid2/Grid2RectangleDetectionVisualisation'),
      (m) => m.Grid2RectangleDetectionVisualisation,
    ),
  ),
  'vec2/definitions': lazy(() =>
    load(import('../demos/vec2/definitions/DefinitionsVisualisation'), (m) => m.DefinitionsVisualisation),
  ),
  'graph/path-search': lazy(() =>
    load(import('../demos/graph/path-search/PathSearchVisualisation'), (m) => m.PathSearchVisualisation),
  ),
  'graph/edge-subgraph': lazy(() =>
    load(import('../demos/graph/edge-subgraph/EdgeSubgraphVisualisation'), (m) => m.EdgeSubgraphVisualisation),
  ),
  'graph/half-edge': lazy(() =>
    load(import('../demos/graph/half-edge/HalfEdgeVisualisation'), (m) => m.HalfEdgeVisualisation),
  ),
};

export type DemoView = { meta: DemoMeta; render: () => ReactNode };

const views = new Map<string, DemoView>(
  visualisationMetas.map((meta) => {
    const key = `${meta.library}/${meta.id}`;
    const Component = components[key];
    if (!Component) throw new Error(`No component registered for demo ${key}`);
    return [key, { meta, render: () => <Component /> }];
  }),
);

/** Every demo with its metadata; `render()` returns a lazy component, so render it inside `<Suspense>`. */
export const visualisationViews: readonly DemoView[] = [...views.values()];

/** One demo by library and id, or `undefined` when there is no such demo. */
export function getDemoView(library: string, id: string): DemoView | undefined {
  const meta = findDemo(library, id);
  return meta && views.get(`${meta.library}/${meta.id}`);
}
