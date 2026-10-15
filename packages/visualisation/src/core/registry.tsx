'use client';

import type { ReactNode } from 'react';
import { Aabb2Visualisation, aabb2VisualisationMeta } from '../demos/aabb2/Aabb2Visualisation';
import {
  Interval2Visualisation,
  interval2VisualisationMeta,
} from '../demos/interval2/Interval2Visualisation';
import {
  Contains2Visualisation,
  contains2VisualisationMeta,
} from '../demos/contains2/Contains2Visualisation';
import {
  ConstrainedDelaunayVisualisation,
  cdtVisualisationMeta,
} from '../demos/constrained-delaunay/ConstrainedDelaunayVisualisation';
import { CurveVisualisation, curveVisualisationMeta } from '../demos/curves/CurveVisualisation';
import {
  IntersectionLines2Visualisation,
  intersectionLines2VisualisationMeta,
} from '../demos/intersection-lines/IntersectionLines2Visualisation';
import { Overlap2Visualisation, overlap2VisualisationMeta } from '../demos/overlap2/Overlap2Visualisation';
import {
  TriMesh2Visualisation,
  triMesh2VisualisationMeta,
} from '../demos/tri-mesh2/TriMesh2Visualisation';
import { Boolean2Visualisation, boolean2VisualisationMeta } from '../demos/boolean2/Boolean2Visualisation';
import { Grid2Visualisation, grid2VisualisationMeta } from '../demos/grid2/Grid2Visualisation';
import {
  Grid2RectangleDetectionVisualisation,
  grid2RectangleDetectionMeta,
} from '../demos/grid2/Grid2RectangleDetectionVisualisation';
import type { VisualisationMeta } from './VisualisationShell';

export const visualisationViews: {
  meta: VisualisationMeta;
  render: () => ReactNode;
}[] = [
  { meta: curveVisualisationMeta, render: () => <CurveVisualisation /> },
  { meta: intersectionLines2VisualisationMeta, render: () => <IntersectionLines2Visualisation /> },
  { meta: cdtVisualisationMeta, render: () => <ConstrainedDelaunayVisualisation /> },
  { meta: contains2VisualisationMeta, render: () => <Contains2Visualisation /> },
  { meta: triMesh2VisualisationMeta, render: () => <TriMesh2Visualisation /> },
  { meta: overlap2VisualisationMeta, render: () => <Overlap2Visualisation /> },
  { meta: boolean2VisualisationMeta, render: () => <Boolean2Visualisation /> },
  { meta: aabb2VisualisationMeta, render: () => <Aabb2Visualisation /> },
  { meta: interval2VisualisationMeta, render: () => <Interval2Visualisation /> },
  { meta: grid2VisualisationMeta, render: () => <Grid2Visualisation /> },
  { meta: grid2RectangleDetectionMeta, render: () => <Grid2RectangleDetectionVisualisation /> },
];
