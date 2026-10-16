'use client';

import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { visualisationMetas } from '../meta';
import type { VisualisationMeta } from './meta';

type DemoModule = Promise<{ default: ComponentType }>;
const load = <M,>(module: Promise<M>, pick: (module: M) => ComponentType): DemoModule =>
  module.then((loaded) => ({ default: pick(loaded) }));

/** Each demo's component (and its three.js code) is loaded only when the demo is first shown. */
const components: Record<string, LazyExoticComponent<ComponentType>> = {
  curves: lazy(() => load(import('../demos/curves/CurveVisualisation'), (m) => m.CurveVisualisation)),
  'intersection-lines': lazy(() =>
    load(
      import('../demos/intersection-lines/IntersectionLines2Visualisation'),
      (m) => m.IntersectionLines2Visualisation,
    ),
  ),
  'constrained-delaunay': lazy(() =>
    load(
      import('../demos/constrained-delaunay/ConstrainedDelaunayVisualisation'),
      (m) => m.ConstrainedDelaunayVisualisation,
    ),
  ),
  contains2: lazy(() => load(import('../demos/contains2/Contains2Visualisation'), (m) => m.Contains2Visualisation)),
  'tri-mesh2': lazy(() => load(import('../demos/tri-mesh2/TriMesh2Visualisation'), (m) => m.TriMesh2Visualisation)),
  overlap2: lazy(() => load(import('../demos/overlap2/Overlap2Visualisation'), (m) => m.Overlap2Visualisation)),
  boolean2: lazy(() => load(import('../demos/boolean2/Boolean2Visualisation'), (m) => m.Boolean2Visualisation)),
  aabb2: lazy(() => load(import('../demos/aabb2/Aabb2Visualisation'), (m) => m.Aabb2Visualisation)),
  interval2: lazy(() => load(import('../demos/interval2/Interval2Visualisation'), (m) => m.Interval2Visualisation)),
  grid2: lazy(() => load(import('../demos/grid2/Grid2Visualisation'), (m) => m.Grid2Visualisation)),
  'grid2/rectangle-detection': lazy(() =>
    load(import('../demos/grid2/Grid2RectangleDetectionVisualisation'), (m) => m.Grid2RectangleDetectionVisualisation),
  ),
};

/** Demos with their metadata; `render()` returns a lazy component, so render it inside `<Suspense>`. */
export const visualisationViews: { meta: VisualisationMeta; render: () => ReactNode }[] = visualisationMetas.map(
  (meta) => {
    const Component = components[meta.id];
    if (!Component) throw new Error(`No component registered for demo ${meta.id}`);
    return { meta, render: () => <Component /> };
  },
);
