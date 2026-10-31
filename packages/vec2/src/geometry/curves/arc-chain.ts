/**
 * The shared core of `ArcPolyline2` (open) and `ArcPolygon2` (closed): a chain of vertices where
 * segment `i` runs from vertex `i` to vertex `i + 1` (wrapping round when closed) and bulges by
 * `sagittas[i]`, exactly 0 for a straight segment.
 */
import type { Coordinate, Length, Parameter, Tolerance } from '../../core/numbers';
import type { Mat3 } from '../../core/mat3';
import { partialSum } from '../../analysis/aggregation/partial-sum';
import { Aabb2 } from '../../bounds/aabb2';
import { Epsilon } from '../../core/epsilon';
import { Vec2 } from '../../core/vec2';
import { Arc2, sagittaFromSweep, segmentOf, similarityOf } from '../primitives/arc2';
import { supportIntersections, type CurveSegment2, type Support2 } from './arc-intersections';

export type ChainData = { vertices: Vec2[]; sagittas: number[] };

/** Check a chain's counts, values and chords; returns copied vertices and snapped sagittas. */
export function validateChain(
  type: string,
  vertices: readonly Vec2[],
  sagittas: readonly Coordinate[],
  closed: boolean,
  epsilon: Epsilon,
): ChainData {
  epsilon.isPositive(type, 'new');
  // A closed chain needs three vertices, or two when an arc bulges between them (a circle, a "D").
  const curved = sagittas.some((s) => Math.abs(s) > epsilon.value);
  const minimum = closed && !curved ? 3 : 2;
  if (vertices.length < minimum) {
    throw new Error(`${type} requires at least ${minimum} vertices`);
  }
  const count = closed ? vertices.length : vertices.length - 1;
  if (sagittas.length !== count) {
    throw new Error(`${type} needs one sagitta per segment: expected ${count}, got ${sagittas.length}`);
  }
  for (let i = 0; i < count; i++) {
    if (vertices[i]!.distance(vertices[(i + 1) % vertices.length]!) <= epsilon.value) {
      throw new Error(`${type}: segment ${i} has no length (consecutive vertices within epsilon)`);
    }
  }
  return {
    vertices: vertices.map((v) => v.clone()),
    sagittas: sagittas.map((s) => {
      if (!Number.isFinite(s)) throw new Error(`${type} sagittas must be finite`);
      return Math.abs(s) <= epsilon.value ? 0 : s;
    }),
  };
}

/** Segments of a chain; sagitta 0 gives a `Line2`. */
export function chainSegments(
  vertices: readonly Vec2[],
  sagittas: readonly number[],
  epsilon: Epsilon,
): CurveSegment2[] {
  return sagittas.map((s, i) => segmentOf(vertices[i]!, vertices[(i + 1) % vertices.length]!, s, epsilon));
}

/** Partial sums of the segment lengths: k + 1 values, starting at 0. */
export function chainLengthTable(segments: readonly CurveSegment2[]): number[] {
  return partialSum(
    segments.map((segment) => segment.length()),
    true,
  );
}

/** Unit direction of travel along a segment. */
export function segmentTangent(segment: CurveSegment2, t: Parameter): Vec2 {
  return segment.type === 'Arc2' ? segment.tangent(t) : segment.direction().unit();
}

/**
 * Segment and local parameter at arc length `length` (clamped to the chain). At a vertex this is the
 * outgoing segment; at the very end, the last segment (or, closed, the first one again).
 */
export function locateLength(
  table: readonly number[],
  length: Length,
  closed: boolean,
): { index: number; t: Parameter } {
  const k = table.length - 1;
  const total = table[k]!;
  let l = Math.min(total, Math.max(0, length));
  if (closed && l >= total) l = 0;
  let index = 0;
  while (index < k - 1 && table[index + 1]! <= l) index++;
  const segmentLength = table[index + 1]! - table[index]!;
  return { index, t: Math.min(1, (l - table[index]!) / segmentLength) };
}

/** Point at segment parameter `u ∈ [0, k]`: integer part the segment, fraction the local parameter. */
export function evaluateChain(segments: readonly CurveSegment2[], u: number): Vec2 {
  const k = segments.length;
  const clamped = Math.min(k, Math.max(0, u));
  if (clamped >= k) return segments[k - 1]!.evaluate(1);
  const index = Math.floor(clamped);
  return segments[index]!.evaluate(clamped - index);
}

/** All arc lengths whose point is nearest `point` (within epsilon plus `additionalTolerance`), ascending. */
export function closestLengths(
  segments: readonly CurveSegment2[],
  table: readonly number[],
  point: Vec2,
  closed: boolean,
  additionalTolerance: Tolerance = 0,
): { lengths: number[]; distance: number } {
  const total = table[table.length - 1]!;
  const candidates = segments.map((segment, i) => {
    const t = segment.closestParameterForPoint(point);
    return { length: table[i]! + t * segment.length(), distance: point.distance(segment.evaluate(t)) };
  });
  const distance = Math.min(...candidates.map((candidate) => candidate.distance));
  const threshold = distance + Epsilon.value + additionalTolerance;
  const lengths: number[] = [];
  for (const candidate of candidates) {
    if (candidate.distance >= threshold) continue;
    const length = closed && candidate.length >= total - Epsilon.value ? 0 : candidate.length;
    if (lengths.every((existing) => Math.abs(existing - length) > Epsilon.value)) lengths.push(length);
  }
  return { lengths: lengths.sort((a, b) => a - b), distance };
}

/** Whether the tangents differ at vertex `index` (an open chain's ends are never kinks). */
export function isKinkAt(
  segments: readonly CurveSegment2[],
  index: number,
  closed: boolean,
  epsilon: Epsilon,
): boolean {
  const k = segments.length;
  if (!closed && (index <= 0 || index >= k)) return false;
  const incoming = segmentTangent(segments[(index - 1 + k) % k]!, 1);
  const outgoing = segmentTangent(segments[index % k]!, 0);
  return Math.abs(incoming.crossProduct(outgoing)) > epsilon.value || incoming.dot(outgoing) < 0;
}

export function chainAabb(segments: readonly CurveSegment2[]): Aabb2 {
  return Aabb2.union(...segments.map((segment) => segment.aabb2()));
}

/** Reverse the direction of travel. A closed chain keeps vertex 0 first. */
export function reverseChain(vertices: readonly Vec2[], sagittas: readonly number[], closed: boolean): ChainData {
  const reversed = [...vertices].reverse();
  return {
    vertices: closed ? [reversed[reversed.length - 1]!, ...reversed.slice(0, -1)] : reversed,
    sagittas: [...sagittas].reverse().map((s) => (s === 0 ? 0 : -s)),
  };
}

/** Map the vertices; arcs need a similarity transform, and their sagittas scale (and flip under a reflection). */
export function transformChain(vertices: readonly Vec2[], sagittas: readonly number[], matrix: Mat3): ChainData {
  const hasArcs = sagittas.some((s) => s !== 0);
  const factor = hasArcs ? similarityFactor(matrix) : 0;
  return {
    vertices: vertices.map((v) => v.transform(matrix)),
    sagittas: sagittas.map((s) => (s === 0 ? 0 : s * factor)),
  };
}

function similarityFactor(matrix: Mat3): number {
  const { scale, determinant } = similarityOf(matrix);
  return scale * Math.sign(determinant);
}

/** Points along the chain with each arc sampled to `chordTolerance`; shared vertices appear once. */
export function samplePoints(segments: readonly CurveSegment2[], closed: boolean, chordTolerance: Length): Vec2[] {
  const points: Vec2[] = [];
  for (const segment of segments) {
    const sampled = segment.type === 'Arc2' ? segment.toPolyline(chordTolerance) : [segment.from, segment.to];
    points.push(...sampled.slice(0, -1).map((v) => v.clone()));
  }
  if (!closed) points.push(segments[segments.length - 1]!.to.clone());
  return points;
}

/**
 * The part of a chain between arc lengths `from` and `to`, as open chain data. When `closed` and
 * `to < from`, the range wraps round through vertex 0.
 */
export function sliceChain(
  segments: readonly CurveSegment2[],
  table: readonly number[],
  from: Length,
  to: Length,
  closed: boolean,
  epsilon: Epsilon,
): ChainData {
  const total = table[table.length - 1]!;
  const clamp = (l: number) => Math.min(total, Math.max(0, l));
  const start = clamp(from);
  const end = clamp(to);
  const builder = new ChainBuilder(epsilon);

  if (closed && end < start) {
    appendRange(builder, segments, table, start, total);
    appendRange(builder, segments, table, 0, end);
  } else {
    if (end - start <= epsilon.value) {
      throw new Error('slice needs a range longer than epsilon');
    }
    appendRange(builder, segments, table, start, end);
  }
  return builder.open();
}

function appendRange(
  builder: ChainBuilder,
  segments: readonly CurveSegment2[],
  table: readonly number[],
  from: number,
  to: number,
): void {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const length = segment.length();
    const t0 = Math.max(0, (from - table[i]!) / length);
    const t1 = Math.min(1, (to - table[i]!) / length);
    if (t1 <= t0) continue;
    const start = segment.evaluate(t0);
    const end = segment.evaluate(t1);
    const sagitta = segment.type === 'Arc2' ? sagittaFromSweep(segment.radius(), (t1 - t0) * segment.sweep()) : 0;
    builder.add(start, end, sagitta);
  }
}

/** Collects segments end to end, dropping ones whose chord is within epsilon. */
class ChainBuilder {
  private readonly vertices: Vec2[] = [];
  private readonly sagittas: number[] = [];

  constructor(private readonly epsilon: Epsilon) {}

  add(from: Vec2, to: Vec2, sagitta: number): void {
    if (this.vertices.length === 0) this.vertices.push(from);
    const last = this.vertices[this.vertices.length - 1]!;
    if (last.distance(to) <= this.epsilon.value) return;
    this.vertices.push(to);
    this.sagittas.push(sagitta);
  }

  open(): ChainData {
    return { vertices: this.vertices, sagittas: this.sagittas };
  }

  /** The chain closed back to its first vertex; the last vertex, which repeats the first, is dropped. */
  closed(): ChainData {
    const vertices = this.vertices.slice();
    const sagittas = this.sagittas.slice();
    if (vertices.length > 1 && vertices[0]!.distance(vertices[vertices.length - 1]!) <= this.epsilon.value) {
      vertices.pop();
    } else {
      sagittas.push(0); // close with a straight segment
    }
    return { vertices, sagittas };
  }
}

/** An offset segment whose ends are moved while joining. Arcs keep their centre, radius and turning direction. */
type Piece =
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'arc'; from: Vec2; to: Vec2; centre: Vec2; radius: number; startAngle: number; sweep: number };

/**
 * The chain moved `distance` to the left (negative: right). Each segment is offset, then neighbours are
 * joined: ends that already meet are kept; at a kink both supports are extended or trimmed to their
 * intersection nearest the original vertex; with no intersection, or one further than
 * `miterLimit·|distance|` from the vertex, a straight connector joins the ends instead.
 */
export function offsetChain(
  vertices: readonly Vec2[],
  segments: readonly CurveSegment2[],
  distance: Coordinate,
  closed: boolean,
  miterLimit: number,
  epsilon: Epsilon,
): ChainData {
  const pieces: Piece[] = segments.map((segment) => offsetPiece(segment, distance));
  const k = pieces.length;
  const connectorAfter = new Array<boolean>(k).fill(false);
  const reach = miterLimit * Math.abs(distance);

  for (let j = closed ? 0 : 1; j < k; j++) {
    const previous = pieces[(j - 1 + k) % k]!;
    const next = pieces[j]!;
    const vertex = vertices[j]!;
    if (previous.to.distance(next.from) <= epsilon.value) {
      const joint = Vec2.center(previous.to, next.from);
      previous.to = joint;
      next.from = joint;
      continue;
    }
    const candidates = supportIntersections(supportOfPiece(previous), supportOfPiece(next), epsilon);
    const nearest = candidates.sort((a, b) => a.distance(vertex) - b.distance(vertex))[0];
    if (nearest && nearest.distance(vertex) <= reach + epsilon.value) {
      previous.to = nearest;
      next.from = nearest;
    } else {
      connectorAfter[(j - 1 + k) % k] = true;
    }
  }

  const builder = new ChainBuilder(epsilon);
  for (let i = 0; i < k; i++) {
    const piece = pieces[i]!;
    builder.add(piece.from, piece.to, pieceSagitta(piece));
    if (connectorAfter[i]) builder.add(piece.to, pieces[(i + 1) % k]!.from, 0);
  }
  return closed ? builder.closed() : builder.open();
}

function offsetPiece(segment: CurveSegment2, distance: number): Piece {
  if (segment.type === 'Line2') {
    const shift = segment.direction().unit().perpendicular().scale(distance);
    return { kind: 'line', from: segment.from.add(shift), to: segment.to.add(shift) };
  }
  const arc = segment.offset(distance);
  return {
    kind: 'arc',
    from: arc.from,
    to: arc.to,
    centre: arc.centre(),
    radius: arc.radius(),
    startAngle: arc.startAngle(),
    sweep: arc.sweep(),
  };
}

function supportOfPiece(piece: Piece): Support2 {
  return piece.kind === 'line'
    ? { kind: 'line', through: piece.from, direction: piece.to.subtract(piece.from) }
    : { kind: 'circle', centre: piece.centre, radius: piece.radius };
}

/** The sagitta of a piece after its ends moved; angles are unwrapped next to the originals, so a small overshoot reverses the arc. */
function pieceSagitta(piece: Piece): number {
  if (piece.kind === 'line') return 0;
  const { centre, radius, startAngle, sweep } = piece;
  const angleOf = (point: Vec2) => Math.atan2(point.y - centre.y, point.x - centre.x);
  const start = startAngle + wrapToPi(angleOf(piece.from) - startAngle);
  const endAngle = startAngle + sweep;
  const end = endAngle + wrapToPi(angleOf(piece.to) - endAngle);
  return sagittaFromSweep(radius, end - start);
}

function wrapToPi(radians: number): number {
  return radians - 2 * Math.PI * Math.round(radians / (2 * Math.PI));
}

/** Segments joining end to end within epsilon, as chain data (closed: the last segment must end at the first's start). */
export function chainFromSegments(
  type: string,
  segments: readonly CurveSegment2[],
  closed: boolean,
  epsilon: Epsilon,
): ChainData {
  if (segments.length === 0) throw new Error(`${type}.fromSegments needs at least one segment`);
  const vertices = [segments[0]!.from];
  const sagittas: number[] = [];
  segments.forEach((segment, i) => {
    if (i > 0 && segments[i - 1]!.to.distance(segment.from) > epsilon.value) {
      throw new Error(`${type}.fromSegments: segment ${i} does not start where segment ${i - 1} ends`);
    }
    vertices.push(segment.to);
    sagittas.push(segment instanceof Arc2 ? segment.sagitta : 0);
  });
  if (closed) {
    if (vertices[vertices.length - 1]!.distance(vertices[0]!) > epsilon.value) {
      throw new Error(`${type}.fromSegments: the last segment does not end where the first starts`);
    }
    vertices.pop();
  }
  return { vertices, sagittas };
}

export type { CurveSegment2 } from './arc-intersections';
