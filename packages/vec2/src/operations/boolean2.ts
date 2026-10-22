import { Aabb2 } from '../bounds/aabb2';
import { Epsilon } from '../core/epsilon';
import { Vec2 } from '../core/vec2';
import type { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { Polygon2 } from '../geometry/regions/polygon2';
import { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { collectConstraintSources } from './helpers/cdt/sources';
import { emptyCdtStats } from './helpers/cdt/stats';
import { triangulateCorners } from './helpers/cdt/triangulate';

export type Boolean2Clip = InfiniteLine2 | Polygon2;
export type Boolean2ClipInput = Boolean2Clip | readonly Boolean2Clip[];

export type Boolean2Options = {
  slack?: Epsilon;
  /** When true, the filtered CDT mesh is included alongside boundary polygons. */
  mesh?: boolean;
};

export type Boolean2Result = {
  polygons: Polygon2[];
  triMesh?: TriMesh2;
};

type ClipMode = 'intersect' | 'subtract';

/**
 * Planar boolean operations built from constrained Delaunay triangulation and
 * non-zero winding classification. Every input edge is a constraint, so the winding numbers are constant
 * on each region of triangles bounded by constraints: one point per region decides it. Boundary loops are
 * extracted from the kept triangles.
 */
export class Boolean2 {
  private constructor() {}

  /** Union of one or more polygons (holes use clockwise winding). */
  static union(polygons: readonly Polygon2[], options: Boolean2Options = {}): Boolean2Result {
    if (polygons.length === 0) return emptyResult(options);

    const winding = new WindingIndex(polygons);
    return runBoolean({
      sources: polygons,
      keep: (point) => winding.at(point) !== 0,
      options,
    });
  }

  /**
   * Intersection of subject polygons with one or more clip geometries: material inside every clip.
   * Clip may be half-planes (`signedDistance <= 0`) and/or filled polygons. As in {@link union}, a
   * clockwise clip polygon is a hole in the smallest counter-clockwise clip polygon that contains it;
   * a clockwise polygon outside every counter-clockwise one is a solid region of its own.
   */
  static intersect(
    subject: readonly Polygon2[],
    clips: Boolean2ClipInput,
    options: Boolean2Options = {},
  ): Boolean2Result {
    return clipBoolean(subject, clips, options, 'intersect');
  }

  /**
   * Subtraction of clip geometry interiors from subject polygons: any clip removes material.
   * Clip polygons group into regions with holes exactly as for {@link intersect}.
   */
  static subtract(
    subject: readonly Polygon2[],
    clips: Boolean2ClipInput,
    options: Boolean2Options = {},
  ): Boolean2Result {
    return clipBoolean(subject, clips, options, 'subtract');
  }
}

function asBoolean2ClipList(clips: Boolean2ClipInput): readonly Boolean2Clip[] {
  return Array.isArray(clips) ? clips : [clips as Boolean2Clip];
}

function clipBoolean(
  subject: readonly Polygon2[],
  clips: Boolean2ClipInput,
  options: Boolean2Options,
  mode: ClipMode,
): Boolean2Result {
  if (subject.length === 0) return emptyResult(options);

  const clipList = asBoolean2ClipList(clips);
  if (clipList.length === 0) return Boolean2.union(subject, options);

  const { halfPlanes, polygons: clipPolygons } = partitionClips(clipList);
  const clipRegions = groupClipRegions(clipPolygons).map(({ outer, holes }) => new WindingIndex([outer, ...holes]));
  const subjectWinding = new WindingIndex(subject);
  const slack = options.slack ?? Epsilon.preferIn;
  const sources = [...subject, ...clipPolygons];

  return runBoolean({
    sources,
    // Half-plane clips need a finite domain so infinite lines intersect geometry.
    bounds: halfPlanes.length > 0 ? workingBounds(sources) : undefined,
    clipLines: halfPlanes,
    keep: (point) => {
      if (subjectWinding.at(point) === 0) return false;
      return mode === 'intersect'
        ? insideAllClips(point, halfPlanes, clipRegions, slack)
        : outsideAllClips(point, halfPlanes, clipRegions, slack);
    },
    options,
  });
}

function partitionClips(clips: readonly Boolean2Clip[]): {
  halfPlanes: InfiniteLine2[];
  polygons: Polygon2[];
} {
  const halfPlanes: InfiniteLine2[] = [];
  const polygons: Polygon2[] = [];
  for (const clip of clips) {
    if (clip.type === 'InfiniteLine2') halfPlanes.push(clip);
    else polygons.push(clip);
  }
  return { halfPlanes, polygons };
}

/** A clip polygon with the clockwise clip polygons that are its holes. */
type ClipRegion = { outer: Polygon2; holes: Polygon2[] };

/**
 * Attach each clockwise clip polygon to the smallest counter-clockwise clip polygon containing it.
 * Clockwise polygons inside no counter-clockwise one stay solid regions on their own.
 */
function groupClipRegions(polygons: readonly Polygon2[]): ClipRegion[] {
  const regions: ClipRegion[] = polygons
    .filter((polygon) => polygon.signedArea() >= 0)
    .map((outer) => ({ outer, holes: [] }));
  const byArea = [...regions].sort((a, b) => a.outer.area() - b.outer.area());

  for (const polygon of polygons) {
    if (polygon.signedArea() >= 0) continue;
    const owner = byArea.find((region) => region.outer.containsPoint(polygon.vertices[0]!));
    if (owner) owner.holes.push(polygon);
    else regions.push({ outer: polygon, holes: [] });
  }
  return regions;
}

function insideAllClips(
  point: Vec2,
  halfPlanes: readonly InfiniteLine2[],
  regions: readonly WindingIndex[],
  slack: Epsilon,
): boolean {
  return (
    halfPlanes.every((plane) => plane.signedDistance(point) <= slack.value) &&
    regions.every((region) => region.at(point) !== 0)
  );
}

function outsideAllClips(
  point: Vec2,
  halfPlanes: readonly InfiniteLine2[],
  regions: readonly WindingIndex[],
  slack: Epsilon,
): boolean {
  return (
    !halfPlanes.some((plane) => plane.signedDistance(point) <= slack.value) &&
    !regions.some((region) => region.at(point) !== 0)
  );
}

type BooleanRun = {
  sources: readonly Polygon2[];
  keep: (point: Vec2) => boolean;
  bounds?: Aabb2;
  clipLines?: readonly InfiniteLine2[];
  options: Boolean2Options;
};

function runBoolean(run: BooleanRun): Boolean2Result {
  const slack = run.options.slack ?? Epsilon.preferIn;
  slack.isPositive('operations - Boolean2', 'run');
  const { points, constraints } = collectConstraintSources(
    [...run.sources, ...(run.bounds ? [Polygon2.fromAabb2(run.bounds)] : []), ...(run.clipLines ?? [])],
    slack,
  );
  const { corners, regions, unresolved } = triangulateCorners(points, constraints, emptyCdtStats(), slack.value);
  // A missing constraint could join regions across an input edge, so then every triangle decides alone.
  const kept = keepTriangles(points, corners, unresolved.length === 0 ? regions : null, run.keep);
  const filtered = TriMesh2.fromCorners(points, kept);
  const polygons = filtered.boundaryLoopPolygons();
  return run.options.mesh ? { polygons, triMesh: filtered } : { polygons };
}

function emptyResult(options: Boolean2Options): Boolean2Result {
  return options.mesh ? { polygons: [], triMesh: TriMesh2.withoutCleanup([], []) } : { polygons: [] };
}

/**
 * The corners of the triangles whose centroid `keep` accepts. With `regions`, `keep` runs once per region
 * and the answer is shared by its triangles.
 */
function keepTriangles(
  vertices: readonly Vec2[],
  corners: Uint32Array,
  regions: Uint32Array | null,
  keep: (point: Vec2) => boolean,
): Uint32Array {
  // Per region: 0 undecided, 1 keep, 2 drop. Labels are dense, so there are at most as many as triangles.
  const decided = new Uint8Array(regions ? corners.length / 3 : 0);
  let kept = 0;
  for (let e = 0; e < corners.length; e += 3) {
    const region = regions ? regions[e / 3]! : -1;
    let verdict = region >= 0 ? decided[region]! : 0;
    if (verdict === 0) {
      const a = vertices[corners[e]!]!;
      const b = vertices[corners[e + 1]!]!;
      const c = vertices[corners[e + 2]!]!;
      verdict = keep(new Vec2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3)) ? 1 : 2;
      if (region >= 0) decided[region] = verdict;
    }
    if (verdict === 2) continue;
    corners.copyWithin(kept, e, e + 3);
    kept += 3;
  }
  return corners.subarray(0, kept);
}

/**
 * Summed winding number of a set of polygons (clockwise loops count negative, so they act as holes).
 * Only edges whose y-range covers the query's y can change the winding, so edges are bucketed into
 * horizontal slabs and a query visits its own slab. Each edge test is `Polygon2.windingNumber`'s, so the
 * result is the same.
 */
class WindingIndex {
  /** Per slab, edge coordinates as `ax, ay, bx, by` runs. */
  private readonly slabs: number[][] = [];
  private readonly minY: number = Infinity;
  private readonly height: number = 1;

  constructor(polygons: readonly Polygon2[]) {
    let maxY = -Infinity;
    let edges = 0;
    for (const polygon of polygons) {
      edges += polygon.vertices.length;
      for (const v of polygon.vertices) {
        this.minY = Math.min(this.minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
    if (edges === 0) return;
    const count = Math.max(1, Math.ceil(Math.sqrt(edges)));
    this.height = (maxY - this.minY) / count || 1;
    for (let i = 0; i < count; i++) this.slabs.push([]);
    for (const { vertices } of polygons) {
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i]!;
        const b = vertices[(i + 1) % vertices.length]!;
        const first = this.slab(Math.min(a.y, b.y));
        const last = this.slab(Math.max(a.y, b.y));
        for (let k = first; k <= last; k++) this.slabs[k]!.push(a.x, a.y, b.x, b.y);
      }
    }
  }

  private slab(y: number): number {
    return Math.min(this.slabs.length - 1, Math.max(0, Math.floor((y - this.minY) / this.height)));
  }

  at(point: Vec2): number {
    if (this.slabs.length === 0) return 0;
    const { x, y } = point;
    const edges = this.slabs[this.slab(y)]!;
    let winding = 0;
    for (let i = 0; i < edges.length; i += 4) {
      const ax = edges[i]!;
      const ay = edges[i + 1]!;
      const bx = edges[i + 2]!;
      const by = edges[i + 3]!;
      const side = (bx - ax) * (y - ay) - (by - ay) * (x - ax); // Vec2.orient(a, b, point)
      if (ay <= y) {
        if (by > y && side > 0) winding++;
      } else if (by <= y && side < 0) winding--;
    }
    return winding;
  }
}

function workingBounds(polygons: readonly Polygon2[]): Aabb2 {
  const aabb = Aabb2.union(...polygons.map((polygon) => polygon.aabb2()));
  const margin = Math.max(aabb.width(), aabb.height(), 1) * 0.1;
  return Aabb2.fromMinMax(
    new Vec2(aabb.min().x - margin, aabb.min().y - margin),
    new Vec2(aabb.max().x + margin, aabb.max().y + margin),
  );
}
