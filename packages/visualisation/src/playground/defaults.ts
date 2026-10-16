/** Default literals for new operands, by type. */
import type { ArgJson } from '@dirty-geometry/vec2/recording/definition';
import type { TypeRef } from '@dirty-geometry/vec2/schema/types';
import { literalShape } from '@dirty-geometry/vec2-dense/definition-schema';
import type { OperandRole } from '@dirty-geometry/vec2-dense/roles';

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

const DEFAULT_NUMBER: Readonly<Record<OperandRole, number>> = {
  coordinate: 1,
  angle: 0,
  parameter: 0.5,
  integer: 0,
  epsilon: 0.000001,
};

/** The literal a new operand of `type` starts with, or `null` when it can only be a node. */
export function defaultLiteral(type: TypeRef, role: OperandRole): ArgJson | null {
  const shape = literalShape(type);
  if (shape.values?.length) return { value: DEFAULT_VALUES[shape.values[0]!] ?? DEFAULT_VALUES.Vec2 };
  if (shape.number) return { lit: DEFAULT_NUMBER[role] };
  if (shape.choices?.length) return { lit: shape.choices[0]! };
  if (shape.boolean) return { lit: false };
  if (shape.array) return { array: [] };
  if (shape.object) return { object: {} };
  if (shape.string) return { lit: '' };
  if (shape.null) return { lit: null };
  return null;
}
