import type { Length } from '../core/numbers';
import { Aabb2 } from '../bounds/aabb2';
import { Epsilon } from '../core/epsilon';
import { Vec2 } from '../core/vec2';
import type { CurveSegment2 } from '../geometry/curves/arc-intersections';
import type { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { Line2 } from '../geometry/primitives/line2';
import { ArcPolygon2 } from '../geometry/regions/arc-polygon2';
import type { Circle2 } from '../geometry/regions/circle2';
import { Polygon2 } from '../geometry/regions/polygon2';
import { TriMesh2 } from '../geometry/regions/tri-mesh2';
import { insideByRule, WindingIndex, type FillRule } from '../geometry/regions/winding';
import { triangulateGeometries } from './helpers/cdt/triangulate';
import { exactCurveBoolean } from './helpers/curve-boolean/exact';

/** A filled shape: straight-sided, with arcs, or a circle. Clockwise shapes are holes. */
export type Boolean2Shape = Polygon2 | ArcPolygon2 | Circle2;
export type Boolean2Clip = InfiniteLine2 | Boolean2Shape;
export type Boolean2ClipInput = Boolean2Clip | readonly Boolean2Clip[];

/**
 * How shapes with arcs (`ArcPolygon2` arcs, `Circle2`) are handled. `exact` (the default) keeps the arcs and
 * returns `regions`; `approximate` replaces each arc by chords within `chordTolerance` and returns `polygons`.
 */
export type Boolean2Arcs = { mode: 'exact' } | { mode: 'approximate'; chordTolerance: Length };

export type Boolean2Options = {
  slack?: Epsilon;
  /** When true, the filtered CDT mesh is included alongside boundary polygons (not available for exact arcs). */
  mesh?: boolean;
  /** How subject and clip polygons decide inside: `nonZero` (default; clockwise loops are holes) or `evenOdd`. */
  fillRule?: FillRule;
  /** Exact or approximate handling of arcs; ignored when no input has any. */
  arcs?: Boolean2Arcs;
};

/**
 * `polygons`: the result as straight-sided loops (inputs without arcs, or `arcs: approximate`).
 * `regions`: the exact result when arcs are involved (`polygons` is then empty). In both, outer loops are
 * counter-clockwise and holes clockwise.
 */
export type Boolean2Result = {
  polygons: Polygon2[];
  regions?: ArcPolygon2[];
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

  /** Union of one or more shapes (holes use clockwise winding). */
  static union(polygons: readonly Boolean2Shape[], options: Boolean2Options = {}): Boolean2Result {
    // `polygons` keeps its name (recorded definitions refer to it); it takes any `Boolean2Shape`.
    if (polygons.length === 0) return emptyResult(options);
    const arcs = arcHandling(polygons, options);
    if (arcs === 'exact') return exactBoolean('union', polygons, [], options);
    return polygonUnion(
      polygons.map((shape) => asPolygon(shape, arcs)),
      options,
    );
  }

  /**
   * Intersection of subject polygons with one or more clip geometries: material inside every clip.
   * Clip may be half-planes (`signedDistance <= 0`) and/or filled polygons. As in {@link union}, a
   * clockwise clip polygon is a hole in the smallest counter-clockwise clip polygon that contains it;
   * a clockwise polygon outside every counter-clockwise one is a solid region of its own.
   */
  static intersect(
    subject: readonly Boolean2Shape[],
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
    subject: readonly Boolean2Shape[],
    clips: Boolean2ClipInput,
    options: Boolean2Options = {},
  ): Boolean2Result {
    return clipBoolean(subject, clips, options, 'subtract');
  }
}

function polygonUnion(polygons: readonly Polygon2[], options: Boolean2Options): Boolean2Result {
  const winding = new WindingIndex(polygons);
  const rule = options.fillRule ?? 'nonZero';
  return runBoolean({
    sources: polygons,
    keep: (point) => winding.contains(point, rule),
    options,
  });
}

/** Whether any shape has an arc (a circle always does). */
function hasArcs(shape: Boolean2Clip): boolean {
  if (shape.type === 'Circle2') return true;
  if (shape.type === 'ArcPolygon2') return shape.sagittas.some((s) => s !== 0);
  return false;
}

/** `null`: no arcs (the polygon path); `'exact'`; or the chord tolerance for the approximate path. */
function arcHandling(shapes: readonly Boolean2Clip[], options: Boolean2Options): null | 'exact' | number {
  if (!shapes.some(hasArcs)) return null;
  const arcs = options.arcs ?? { mode: 'exact' };
  if (arcs.mode === 'approximate') {
    if (!(arcs.chordTolerance > 0)) throw new Error('Boolean2: arcs.chordTolerance must be positive');
    return arcs.chordTolerance;
  }
  if (options.mesh) {
    throw new Error("Boolean2: a mesh needs straight edges; use arcs: { mode: 'approximate', chordTolerance }");
  }
  return 'exact';
}

/** A shape as a polygon: arcs replaced by chords within `chordTolerance` (when `null`, it has none). */
function asPolygon(shape: Boolean2Shape, chordTolerance: number | null): Polygon2 {
  if (shape.type === 'Polygon2') return shape;
  const region = shape.type === 'Circle2' ? ArcPolygon2.fromCircle2(shape) : shape;
  return chordTolerance === null ? new Polygon2([...region.vertices]) : region.toPolygon(chordTolerance);
}

function asRegion(shape: Boolean2Shape): ArcPolygon2 {
  if (shape.type === 'ArcPolygon2') return shape;
  return shape.type === 'Circle2' ? ArcPolygon2.fromCircle2(shape) : ArcPolygon2.fromPolygon(shape);
}

/** Exact booleans with arcs: classify the pieces of every boundary by the same inside rules as the polygon path. */
function exactBoolean(
  mode: 'union' | ClipMode,
  subject: readonly Boolean2Shape[],
  clips: readonly Boolean2Clip[],
  options: Boolean2Options,
): Boolean2Result {
  const slack = options.slack ?? Epsilon.preferIn;
  slack.isPositive('operations - Boolean2', 'run');
  const rule = options.fillRule ?? 'nonZero';
  const subjectRegions = subject.map(asRegion);
  const halfPlanes = clips.filter((clip): clip is InfiniteLine2 => clip.type === 'InfiniteLine2');
  const clipRegions = clips.filter((clip): clip is Boolean2Shape => clip.type !== 'InfiniteLine2').map(asRegion);
  const groups = groupClipRegions(clipRegions).map(({ outer, holes }) => [outer, ...holes]);
  const insideLoops = (loops: readonly ArcPolygon2[], point: Vec2) =>
    insideByRule(
      loops.reduce((sum, loop) => sum + loop.windingNumber(point), 0),
      rule,
    );

  const inside = (point: Vec2): boolean => {
    if (!insideLoops(subjectRegions, point)) return false;
    if (mode === 'union') return true;
    const inPlane = (plane: InfiniteLine2) => plane.signedDistance(point) <= 0;
    return mode === 'intersect'
      ? halfPlanes.every(inPlane) && groups.every((group) => insideLoops(group, point))
      : !halfPlanes.some(inPlane) && !groups.some((group) => insideLoops(group, point));
  };

  const regions = [...subjectRegions, ...clipRegions];
  const boundaries: CurveSegment2[] = regions.flatMap((region) => region.segments());
  if (halfPlanes.length > 0) {
    const bounds = workingBounds(regions);
    for (const plane of halfPlanes) {
      const segment = lineInBox(plane, bounds);
      if (segment) boundaries.push(segment);
    }
  }
  return { polygons: [], regions: exactCurveBoolean(boundaries, inside, slack) };
}

/** The part of an infinite line inside a box, or `null` when it misses. */
function lineInBox(line: InfiniteLine2, box: Aabb2): Line2 | null {
  const { through, direction } = line;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [origin, delta, min, max] of [
    [through.x, direction.x, box.x.min, box.x.max],
    [through.y, direction.y, box.y.min, box.y.max],
  ] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const a = (min - origin) / delta;
    const b = (max - origin) / delta;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 > t0 ? new Line2(line.evaluate(t0), line.evaluate(t1)) : null;
}

function asBoolean2ClipList(clips: Boolean2ClipInput): readonly Boolean2Clip[] {
  return Array.isArray(clips) ? clips : [clips as Boolean2Clip];
}

function clipBoolean(
  subject: readonly Boolean2Shape[],
  clips: Boolean2ClipInput,
  options: Boolean2Options,
  mode: ClipMode,
): Boolean2Result {
  if (subject.length === 0) return emptyResult(options);

  const clipList = asBoolean2ClipList(clips);
  if (clipList.length === 0) return Boolean2.union(subject, options);

  const arcs = arcHandling([...subject, ...clipList], options);
  if (arcs === 'exact') return exactBoolean(mode, subject, clipList, options);
  const chordTolerance = arcs;
  const subjectPolygons = subject.map((shape) => asPolygon(shape, chordTolerance));
  const { halfPlanes, polygons: clipPolygons } = partitionClips(
    clipList.map((clip) => (clip.type === 'InfiniteLine2' ? clip : asPolygon(clip, chordTolerance))),
  );
  const clipRegions = groupClipRegions(clipPolygons).map(({ outer, holes }) => new WindingIndex([outer, ...holes]));
  const subjectWinding = new WindingIndex(subjectPolygons);
  const rule = options.fillRule ?? 'nonZero';
  const slack = options.slack ?? Epsilon.preferIn;
  const sources = [...subjectPolygons, ...clipPolygons];

  return runBoolean({
    sources,
    // Half-plane clips need a finite domain so infinite lines intersect geometry.
    bounds: halfPlanes.length > 0 ? workingBounds(sources) : undefined,
    clipLines: halfPlanes,
    keep: (point) => {
      if (!subjectWinding.contains(point, rule)) return false;
      return mode === 'intersect'
        ? insideAllClips(point, halfPlanes, clipRegions, rule, slack)
        : outsideAllClips(point, halfPlanes, clipRegions, rule, slack);
    },
    options,
  });
}

function partitionClips(clips: readonly (InfiniteLine2 | Polygon2)[]): {
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

/** A clip shape with the clockwise clip shapes that are its holes. */
type ClipRegion<T> = { outer: T; holes: T[] };
type Loop = {
  readonly vertices: readonly Vec2[];
  signedArea(): number;
  area(): number;
  containsPoint(point: Vec2): boolean;
};

/**
 * Attach each clockwise clip polygon to the smallest counter-clockwise clip polygon containing it.
 * Clockwise polygons inside no counter-clockwise one stay solid regions on their own.
 */
function groupClipRegions<T extends Loop>(polygons: readonly T[]): ClipRegion<T>[] {
  const regions: ClipRegion<T>[] = polygons
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
  rule: FillRule,
  slack: Epsilon,
): boolean {
  return (
    halfPlanes.every((plane) => plane.signedDistance(point) <= slack.value) &&
    regions.every((region) => region.contains(point, rule))
  );
}

function outsideAllClips(
  point: Vec2,
  halfPlanes: readonly InfiniteLine2[],
  regions: readonly WindingIndex[],
  rule: FillRule,
  slack: Epsilon,
): boolean {
  return (
    !halfPlanes.some((plane) => plane.signedDistance(point) <= slack.value) &&
    !regions.some((region) => region.contains(point, rule))
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
  const { points, corners, regions, unresolved } = triangulateGeometries(
    [...run.sources, ...(run.bounds ? [Polygon2.fromAabb2(run.bounds)] : []), ...(run.clipLines ?? [])],
    slack,
  );
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

function workingBounds(polygons: readonly { aabb2(): Aabb2 }[]): Aabb2 {
  const aabb = Aabb2.union(...polygons.map((polygon) => polygon.aabb2()));
  const margin = Math.max(aabb.width(), aabb.height(), 1) * 0.1;
  return Aabb2.fromMinMax(
    new Vec2(aabb.min().x - margin, aabb.min().y - margin),
    new Vec2(aabb.max().x + margin, aabb.max().y + margin),
  );
}
