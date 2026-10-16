/**
 * Demo metadata only: no React or three.js, so a page can list the demos cheaply
 * (`@dirty-geometry/visualisation/meta`).
 */
import { aabb2VisualisationMeta } from './demos/aabb2/meta';
import { boolean2VisualisationMeta } from './demos/boolean2/meta';
import { cdtVisualisationMeta } from './demos/constrained-delaunay/meta';
import { contains2VisualisationMeta } from './demos/contains2/meta';
import { curveVisualisationMeta } from './demos/curves/meta';
import { grid2RectangleDetectionMeta, grid2VisualisationMeta } from './demos/grid2/meta';
import { intersectionLines2VisualisationMeta } from './demos/intersection-lines/meta';
import { interval2VisualisationMeta } from './demos/interval2/meta';
import { overlap2VisualisationMeta } from './demos/overlap2/meta';
import { triMesh2VisualisationMeta } from './demos/tri-mesh2/meta';
import type { VisualisationMeta } from './core/meta';

export type { LegendItem, VisualisationMeta } from './core/meta';

/** Demos in the order the lab lists them. */
export const visualisationMetas: readonly VisualisationMeta[] = [
  curveVisualisationMeta,
  intersectionLines2VisualisationMeta,
  cdtVisualisationMeta,
  contains2VisualisationMeta,
  triMesh2VisualisationMeta,
  overlap2VisualisationMeta,
  boolean2VisualisationMeta,
  aabb2VisualisationMeta,
  interval2VisualisationMeta,
  grid2VisualisationMeta,
  grid2RectangleDetectionMeta,
];
