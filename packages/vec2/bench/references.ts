/**
 * Adapters that run the npm comparison libraries on the same input as `ConstrainedDelaunay`, each
 * returning counter-clockwise triangles as vertex-index triples. Dev only: used by `bench/cdt.ts`
 * and `test/operations/cdt-oracle.test.ts`, never by `src/`.
 */
import cdt2d from 'cdt2d';
import Delaunator from 'delaunator';
import * as poly2tri from 'poly2tri';
import type { Vec2 } from '../src/core/vec2';

// Constrainautor publishes raw .ts sources as its types, which fail this repo's strict settings, so it is
// loaded through a non-literal specifier (not type-checked) with the small surface used here.
type ConstrainautorCtor = new (del: Delaunator) => { constrainAll(edges: [number, number][]): unknown };
const constrainautorModule: string = '@kninnug/constrainautor';
const { default: Constrainautor } = (await import(constrainautorModule)) as { default: ConstrainautorCtor };

export type Triangle = [number, number, number];
export type Edge = readonly [number, number];
export type Reference = (points: readonly Vec2[], constraints: readonly Edge[]) => Triangle[];

function flatCoords(points: readonly Vec2[]): Float64Array {
  const coords = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    coords[2 * i] = points[i]!.x;
    coords[2 * i + 1] = points[i]!.y;
  }
  return coords;
}

/** Delaunator triangles are clockwise in y-up coordinates; flip them to counter-clockwise. */
function delaunatorTriangles(triangles: ArrayLike<number>): Triangle[] {
  const out: Triangle[] = [];
  for (let i = 0; i < triangles.length; i += 3) out.push([triangles[i]!, triangles[i + 2]!, triangles[i + 1]!]);
  return out;
}

/** Unconstrained Delaunay (ignores `constraints`). */
export const delaunator: Reference = (points) => delaunatorTriangles(new Delaunator(flatCoords(points)).triangles);

/** Delaunator + Constrainautor: constrained Delaunay over the convex hull. */
export const constrainautor: Reference = (points, constraints) => {
  const del = new Delaunator(flatCoords(points));
  const con = new Constrainautor(del);
  con.constrainAll(constraints.map(([a, b]) => [a, b] as [number, number]));
  return delaunatorTriangles(del.triangles);
};

/** cdt2d with every face of the hull kept. Its triangles are counter-clockwise already. */
export const cdt2dAll: Reference = (points, constraints) =>
  cdt2d(
    points.map((p) => [p.x, p.y] as const),
    constraints,
    { delaunay: true, interior: true, exterior: true },
  );

/**
 * poly2tri: `contour` is the outer polygon (indices into `points`), every other point is a Steiner point.
 * It only triangulates the polygon interior and only supports polygon constraints, so it is a
 * reference for the ring cases only.
 */
export function poly2triRing(points: readonly Vec2[], contour: readonly number[]): Triangle[] {
  type Tagged = { x: number; y: number; index: number };
  const tagged: Tagged[] = points.map((p, index) => ({ x: p.x, y: p.y, index }));
  const inContour = new Set(contour);
  const ctx = new poly2tri.SweepContext(contour.map((i) => tagged[i]!));
  ctx.addPoints(tagged.filter((p) => !inContour.has(p.index)));
  ctx.triangulate();
  return ctx.getTriangles().map((t) => {
    const [a, b, c] = t.getPoints() as unknown as [Tagged, Tagged, Tagged];
    return [a.index, b.index, c.index];
  });
}
