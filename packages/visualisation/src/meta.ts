/**
 * Demo metadata only: no React or three.js, so a page can list the demos cheaply
 * (`@dirty-geometry/visualisation/meta`).
 */
import { aabb2VisualisationMeta } from './demos/vec2/aabb2/meta';
import { boolean2VisualisationMeta } from './demos/vec2/boolean2/meta';
import { cdtVisualisationMeta } from './demos/vec2/constrained-delaunay/meta';
import { contains2VisualisationMeta } from './demos/vec2/contains2/meta';
import { curveVisualisationMeta } from './demos/vec2/curves/meta';
import { grid2RectangleDetectionMeta, grid2VisualisationMeta } from './demos/vec2/grid2/meta';
import { intersectionLines2VisualisationMeta } from './demos/vec2/intersection-lines/meta';
import { interval2VisualisationMeta } from './demos/vec2/interval2/meta';
import { overlap2VisualisationMeta } from './demos/vec2/overlap2/meta';
import { triMesh2VisualisationMeta } from './demos/vec2/tri-mesh2/meta';
import type { VisualisationMeta } from './core/meta';

export type { LegendItem, VisualisationMeta } from './core/meta';

/** The libraries the lab has demos for; each gets its own route (`/lab/<library>/<demo>`). */
export const demoLibraries = ['vec2', 'graph'] as const;
export type DemoLibrary = (typeof demoLibraries)[number];

export type DemoLibraryInfo = {
  id: DemoLibrary;
  label: string;
  /** npm package the demos exercise. */
  packageName: string;
  blurb: string;
};

export const demoLibraryInfo: Readonly<Record<DemoLibrary, DemoLibraryInfo>> = {
  vec2: {
    id: 'vec2',
    label: 'vec2',
    packageName: '@dirty-geometry/vec2',
    blurb: 'Curves, intersections, triangulation, containment, overlap, booleans, bounds and grids.',
  },
  graph: {
    id: 'graph',
    label: 'graph',
    packageName: '@dirty-geometry/graph',
    blurb: 'Path search, edge-subset helpers and half-edge meshes on 2D graphs.',
  },
};

/** A demo's metadata plus the library it belongs to. */
export type DemoMeta = VisualisationMeta & { library: DemoLibrary };

const inLibrary = (library: DemoLibrary, metas: readonly VisualisationMeta[]): DemoMeta[] =>
  metas.map((meta) => ({ ...meta, library }));

/** Demos in the order the lab lists them. */
export const visualisationMetas: readonly DemoMeta[] = [
  ...inLibrary('vec2', [
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
  ]),
];

export function isDemoLibrary(value: string): value is DemoLibrary {
  return (demoLibraries as readonly string[]).includes(value);
}

/** The demos of one library, in lab order. */
export function demosFor(library: DemoLibrary): DemoMeta[] {
  return visualisationMetas.filter((meta) => meta.library === library);
}

export function findDemo(library: string, id: string): DemoMeta | undefined {
  return visualisationMetas.find((meta) => meta.library === library && meta.id === id);
}
