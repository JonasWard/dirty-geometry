/** The literal forms an operand type admits, and the literal a new operand starts with. */
import type { ArgV3 as Arg } from '@dirty-geometry/vec2/recording/v3';
import { classJson, isKind, NUMBER_TYPES, resolve, type Slot, type Type } from '@dirty-geometry/vec2/schema/schema';

/** What literal forms a type admits, merged over unions; `number` is the number type (`Coordinate`, `Radians`, …). */
export type LiteralShape = {
  number?: string;
  boolean?: true;
  string?: true;
  null?: true;
  choices?: (string | number | boolean)[];
  /** vec2 value tags (`toJson().type`) the operand accepts as stored values. */
  values?: string[];
  array?: Type;
  object?: Record<string, Slot>;
};

const tagOf = (cls: string) => classJson[cls]!.replace(/Json$/, '');

export function literalShape(type: Type, shape: LiteralShape = {}): LiteralShape {
  const t = resolve(type);
  if (typeof t === 'string') {
    if (t in classJson) shape.values = [...new Set([...(shape.values ?? []), tagOf(t)])];
    else if (t === 'boolean' || t === 'string' || t === 'null') shape[t] = true;
    else if (t === 'number' || NUMBER_TYPES.includes(t)) shape.number ??= t === 'number' ? 'Coordinate' : t;
    return shape;
  }
  const o = t as Record<string, any>;
  if (Array.isArray(t)) shape.array = t[0];
  else if (isKind(o, 'tuple')) shape.array = o.tuple[0];
  else if (isKind(o, 'or')) o.or.forEach((member: Type) => literalShape(member, shape));
  else if (isKind(o, 'enum')) {
    if (o.enum.includes(null)) shape.null = true;
    shape.choices = [...(shape.choices ?? []), ...o.enum.filter((v: unknown) => v !== null)];
  } else if (!isKind(o, 'record')) shape.object = { ...shape.object, ...o };
  return shape;
}

const v = (x: number, y: number) => ({ type: 'Vec2', x, y });

/** A small, valid codec-JSON value per vec2 type. */
export const DEFAULT_VALUES: Readonly<Record<string, unknown>> = {
  Vec2: v(0, 0),
  Mat3: { type: 'Mat3', elements: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  Angle: { type: 'Angle', value: 0, domainKind: 'tau', precision: 0.1 },
  Frame2: { type: 'Frame2', origin: v(0, 0), xAxis: v(1, 0), yAxis: v(0, 1) },
  Epsilon: { type: 'Epsilon', value: 0.000001 },
  Interval2: { type: 'Interval2', min: 0, max: 1 },
  Aabb2: { type: 'Aabb2', x: { type: 'Interval2', min: 0, max: 1 }, y: { type: 'Interval2', min: 0, max: 1 } },
  Line2: { type: 'Line2', from: v(0, 0), to: v(1, 0) },
  Ray2: { type: 'Ray2', start: v(0, 0), direction: v(1, 0) },
  InfiniteLine2: { type: 'InfiniteLine2', through: v(0, 0), direction: v(1, 0) },
  Hesse2: { type: 'Hesse2', normal: v(0, 1), offset: 0 },
  Polyline2: { type: 'Polyline2', vertices: [v(0, 0), v(1, 0), v(1, 1)] },
  Polygon2: { type: 'Polygon2', vertices: [v(0, 0), v(1, 0), v(1, 1), v(0, 1)] },
  Circle2: { type: 'Circle2', center: v(0, 0), radius: 1 },
  TriMesh2: { type: 'TriMesh2', vertices: [v(0, 0), v(1, 0), v(0, 1)], triangles: [[0, 1, 2]] },
  GridCell2: { type: 'GridCell2', i: 0, j: 0 },
  Axis: { type: 'Axis', kind: 'unit' },
  Grid2: { type: 'Grid2', u: { type: 'Axis', kind: 'unit' }, v: { type: 'Axis', kind: 'unit' } },
  GridLine2: { type: 'GridLine2', from: { type: 'GridCell2', i: 0, j: 0 }, to: { type: 'GridCell2', i: 3, j: 0 } },
  GridPolyline2: {
    type: 'GridPolyline2',
    vertices: [
      { type: 'GridCell2', i: 0, j: 0 },
      { type: 'GridCell2', i: 0, j: 3 },
    ],
  },
  GridPolygon2: {
    type: 'GridPolygon2',
    vertices: [
      { type: 'GridCell2', i: 0, j: 0 },
      { type: 'GridCell2', i: 3, j: 0 },
      { type: 'GridCell2', i: 3, j: 3 },
    ],
  },
  GridRectangle2: {
    type: 'GridRectangle2',
    bottomLeft: { type: 'GridCell2', i: 0, j: 0 },
    topRight: { type: 'GridCell2', i: 2, j: 2 },
  },
  CellCollection: { type: 'CellCollection', cells: [{ type: 'GridCell2', i: 0, j: 0 }] },
};

const DEFAULT_NUMBER: Readonly<Record<string, number>> = {
  Coordinate: 1,
  Length: 1,
  Parameter: 0.5,
  Tolerance: 0.000001,
};

/** The literal a new operand of `type` starts with, or `undefined` when it can only be a node. */
export function defaultLiteral(type: Type): Arg | undefined {
  const shape = literalShape(type);
  if (shape.values?.length) return { value: DEFAULT_VALUES[shape.values[0]!] ?? DEFAULT_VALUES.Vec2 };
  if (shape.number) return DEFAULT_NUMBER[shape.number] ?? 0;
  if (shape.choices?.length) return shape.choices[0]!;
  if (shape.boolean) return false;
  if (shape.array) return [];
  if (shape.object) return { object: {} };
  if (shape.string) return '';
  return shape.null ? null : undefined;
}
