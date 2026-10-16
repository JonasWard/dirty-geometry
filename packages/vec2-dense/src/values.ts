/**
 * densing templates for every vec2 value type, mirroring each type's codec JSON (`toJson()`), plus the
 * converters between codec JSON and densing data. Numbers go through the shared numeric definitions and are
 * snapped onto the active preset's grid.
 */
import type { DenseField, NumericDefinition, ReferenceField } from 'densing';
import { isDegreePreset, quantise, resolvePreset, type ActivePresets, type NumericRole } from './numerics';

export const MAX_VERTICES = 4096;
export const MAX_CELLS = 65536;

/** Templates by key; a key is registered once, so shared shapes (Vec2, Interval2) are stored once. */
export class TemplateTable {
  readonly templates: DenseField[] = [];
  private readonly byKey = new Map<string, number>();

  ref(name: string, key: string, build: () => DenseField): ReferenceField {
    let index = this.byKey.get(key);
    if (index === undefined) {
      index = this.templates.length;
      this.byKey.set(key, index);
      this.templates.push({ type: 'bool', name: 'placeholder', defaultValue: false });
      this.templates[index] = build();
    }
    return { type: 'reference', name, ref: index };
  }
}

/** Numbers are snapped with the presets active for the payload. */
export class NumericContext {
  constructor(
    readonly definitions: readonly NumericDefinition[],
    readonly active: ActivePresets = {},
  ) {}

  /** A number as stored: snapped onto the active preset's grid (angles converted to degrees for degree presets). */
  q(role: NumericRole, value: number, label: string): number {
    const preset = resolvePreset(this.definitions, role, this.active);
    const degrees = role === 'angle' && isDegreePreset(preset.name);
    return quantise(degrees ? (value * 180) / Math.PI : value, preset, label);
  }

  /** A stored number back in vec2 units (radians for angles). */
  d(role: NumericRole, stored: number): number {
    if (role !== 'angle') return stored;
    return isDegreePreset(resolvePreset(this.definitions, role, this.active).name) ? (stored * Math.PI) / 180 : stored;
  }
}

// ---- field helpers (plain densing schema JSON) ----
export const num = (name: string, role: NumericRole): DenseField => ({ type: 'reference_numeric', name, ref: role });
export const intField = (name: string, min: number, max: number): DenseField => ({
  type: 'int',
  name,
  min,
  max,
  defaultValue: min,
});
export const enumField = (name: string, options: readonly string[]) =>
  ({ type: 'enum', name, options, defaultValue: options[0]! }) as const;
export const obj = (name: string, ...fields: DenseField[]): DenseField => ({ type: 'object', name, fields });
export const arr = (name: string, minLength: number, maxLength: number, items: DenseField): DenseField => ({
  type: 'array',
  name,
  minLength,
  maxLength,
  items,
});
export const opt = (name: string, field: DenseField): DenseField => ({ type: 'optional', name, field });
export const uni = (name: string, discriminator: string, variants: Record<string, DenseField[]>): DenseField => ({
  type: 'union',
  name,
  discriminator: enumField(discriminator, Object.keys(variants)),
  variants,
});

/** Every vec2 value type with a codec (see `io/default-registry`). */
export const VALUE_TYPES = [
  'Vec2',
  'Mat3',
  'Angle',
  'Frame2',
  'Epsilon',
  'Interval2',
  'Aabb2',
  'Line2',
  'Ray2',
  'InfiniteLine2',
  'Hesse2',
  'Polyline2',
  'Polygon2',
  'Circle2',
  'TriMesh2',
  'GridCell2',
  'Axis',
  'Grid2',
  'GridLine2',
  'GridPolyline2',
  'GridPolygon2',
  'GridRectangle2',
  'CellCollection',
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

type Json = Record<string, any>;
type Data = Record<string, any>;

type ValueSpec = {
  field: (table: TemplateTable) => DenseField;
  encode: (json: Json, ctx: NumericContext, label: string) => Data;
  decode: (data: Data, ctx: NumericContext) => Json;
};

const ref = (table: TemplateTable, type: ValueType, name: string): ReferenceField =>
  table.ref(name, `value:${type}`, () => SPECS[type].field(table));
const enc = (type: ValueType, json: Json, ctx: NumericContext, label: string): Data =>
  SPECS[type].encode(json, ctx, label);
const dec = (type: ValueType, data: Data, ctx: NumericContext): Json => SPECS[type].decode(data, ctx);

const point = (field: string) => ({
  encode: (json: Json, ctx: NumericContext, label: string): Data => enc('Vec2', json[field], ctx, `${label}.${field}`),
});

function twoPoints(type: ValueType, a: string, b: string): ValueSpec {
  return {
    field: (t) => obj(type, ref(t, 'Vec2', a), ref(t, 'Vec2', b)),
    encode: (json, ctx, label) => ({ [a]: point(a).encode(json, ctx, label), [b]: point(b).encode(json, ctx, label) }),
    decode: (data, ctx) => ({ type, [a]: dec('Vec2', data[a], ctx), [b]: dec('Vec2', data[b], ctx) }),
  };
}

function vertexList(
  type: ValueType,
  element: 'Vec2' | 'GridCell2',
  field: string,
  min: number,
  max: number,
): ValueSpec {
  return {
    field: (t) => obj(type, arr(field, min, max, ref(t, element, 'vertex'))),
    encode: (json, ctx, label) => ({
      [field]: (json[field] as Json[]).map((item, index) => enc(element, item, ctx, `${label}.${field}[${index}]`)),
    }),
    decode: (data, ctx) => ({ type, [field]: (data[field] as Data[]).map((item) => dec(element, item, ctx)) }),
  };
}

function twoCells(type: ValueType, a: string, b: string): ValueSpec {
  return {
    field: (t) => obj(type, ref(t, 'GridCell2', a), ref(t, 'GridCell2', b)),
    encode: (json, ctx, label) => ({
      [a]: enc('GridCell2', json[a], ctx, `${label}.${a}`),
      [b]: enc('GridCell2', json[b], ctx, `${label}.${b}`),
    }),
    decode: (data, ctx) => ({ type, [a]: dec('GridCell2', data[a], ctx), [b]: dec('GridCell2', data[b], ctx) }),
  };
}

const ANGLE_PRECISIONS = ['1', '0.1', '0.01', '0.001'] as const;

const EPSILON_DEFAULT = 1e-6;

function encodeEpsilon(value: number, label: string): Data {
  if (value === EPSILON_DEFAULT) return { kind: 'preferIn' };
  if (value === -EPSILON_DEFAULT) return { kind: 'preferOut' };
  const magnitude = Math.abs(value);
  if (!(magnitude > 0) || !Number.isFinite(magnitude))
    throw new RangeError(`${label}: epsilon ${value} must be non-zero and finite`);
  let exponent = Math.floor(Math.log10(magnitude)) - 2;
  let mantissa = Math.round(magnitude / 10 ** exponent);
  if (mantissa >= 1000) {
    mantissa = Math.round(mantissa / 10);
    exponent++;
  }
  if (exponent < -18 || exponent > 0) throw new RangeError(`${label}: epsilon ${value} is outside 1e-18 … 999`);
  return { kind: 'custom', side: value > 0 ? 'in' : 'out', mantissa, exponent };
}

function decodeEpsilon(data: Data): number {
  if (data.kind === 'preferIn') return EPSILON_DEFAULT;
  if (data.kind === 'preferOut') return -EPSILON_DEFAULT;
  const magnitude = Number(`${data.mantissa}e${data.exponent}`);
  return data.side === 'in' ? magnitude : -magnitude;
}

/** Interval endpoints: finite numbers, or ±Infinity (codec JSON writes them as strings). */
const endpoint = (name: string): DenseField =>
  uni(name, 'kind', { finite: [num('value', 'coordinate')], infinity: [], negativeInfinity: [] });

function encodeEndpoint(value: unknown, ctx: NumericContext, label: string): Data {
  if (value === Infinity || value === 'Infinity') return { kind: 'infinity' };
  if (value === -Infinity || value === '-Infinity') return { kind: 'negativeInfinity' };
  if (value === null) throw new RangeError(`${label}: legacy null endpoints are ambiguous; re-save the value`);
  return { kind: 'finite', value: ctx.q('coordinate', value as number, label) };
}

const decodeEndpoint = (data: Data): number | string =>
  data.kind === 'finite' ? data.value : data.kind === 'infinity' ? 'Infinity' : '-Infinity';

function axisVariants(t: TemplateTable): Record<string, DenseField[]> {
  const domain = () => opt('domain', ref(t, 'Interval2', 'interval'));
  return {
    unit: [domain()],
    uniform: [num('size', 'coordinate'), domain()],
    custom: [
      num('defaultSize', 'coordinate'),
      arr('sizes', 0, MAX_CELLS, obj('size', num('index', 'integer'), num('size', 'coordinate'))),
      domain(),
    ],
  };
}

const SPECS: Record<ValueType, ValueSpec> = {
  Vec2: {
    field: () => obj('Vec2', num('x', 'coordinate'), num('y', 'coordinate')),
    encode: (json, ctx, label) => ({
      x: ctx.q('coordinate', json.x, `${label}.x`),
      y: ctx.q('coordinate', json.y, `${label}.y`),
    }),
    decode: (data, ctx) => ({ type: 'Vec2', x: data.x, y: data.y }),
  },
  Mat3: {
    field: () => obj('Mat3', arr('elements', 9, 9, num('element', 'coordinate'))),
    encode: (json, ctx, label) => ({
      elements: (json.elements as number[]).map((value, index) =>
        ctx.q('coordinate', value, `${label}.elements[${index}]`),
      ),
    }),
    decode: (data, ctx) => ({ type: 'Mat3', elements: data.elements }),
  },
  Angle: {
    field: () =>
      obj(
        'Angle',
        num('value', 'angle'),
        enumField('domainKind', ['tau', 'pi']),
        enumField('precision', ANGLE_PRECISIONS),
      ),
    encode: (json, ctx, label) => ({
      value: ctx.q('angle', json.value, `${label}.value`),
      domainKind: json.domainKind,
      precision: String(json.precision),
    }),
    decode: (data, ctx) => ({
      type: 'Angle',
      value: ctx.d('angle', data.value),
      domainKind: data.domainKind,
      precision: Number(data.precision),
    }),
  },
  Frame2: {
    field: (t) => obj('Frame2', ref(t, 'Vec2', 'origin'), ref(t, 'Vec2', 'xAxis'), ref(t, 'Vec2', 'yAxis')),
    encode: (json, ctx, label) => ({
      origin: point('origin').encode(json, ctx, label),
      xAxis: point('xAxis').encode(json, ctx, label),
      yAxis: point('yAxis').encode(json, ctx, label),
    }),
    decode: (data, ctx) => ({
      type: 'Frame2',
      origin: dec('Vec2', data.origin, ctx),
      xAxis: dec('Vec2', data.xAxis, ctx),
      yAxis: dec('Vec2', data.yAxis, ctx),
    }),
  },
  Epsilon: {
    field: () =>
      uni('Epsilon', 'kind', {
        preferIn: [],
        preferOut: [],
        custom: [enumField('side', ['in', 'out']), intField('mantissa', 1, 999), intField('exponent', -18, 0)],
      }),
    encode: (json, _ctx, label) => encodeEpsilon(json.value, label),
    decode: (data, ctx) => ({ type: 'Epsilon', value: decodeEpsilon(data) }),
  },
  Interval2: {
    field: () => obj('Interval2', endpoint('min'), endpoint('max')),
    encode: (json, ctx, label) => ({
      min: encodeEndpoint(json.min, ctx, `${label}.min`),
      max: encodeEndpoint(json.max, ctx, `${label}.max`),
    }),
    decode: (data, ctx) => ({ type: 'Interval2', min: decodeEndpoint(data.min), max: decodeEndpoint(data.max) }),
  },
  Aabb2: {
    field: (t) => obj('Aabb2', ref(t, 'Interval2', 'x'), ref(t, 'Interval2', 'y')),
    encode: (json, ctx, label) => ({
      x: enc('Interval2', json.x, ctx, `${label}.x`),
      y: enc('Interval2', json.y, ctx, `${label}.y`),
    }),
    decode: (data, ctx) => ({ type: 'Aabb2', x: dec('Interval2', data.x, ctx), y: dec('Interval2', data.y, ctx) }),
  },
  Line2: twoPoints('Line2', 'from', 'to'),
  Ray2: twoPoints('Ray2', 'start', 'direction'),
  InfiniteLine2: twoPoints('InfiniteLine2', 'through', 'direction'),
  Hesse2: {
    field: (t) => obj('Hesse2', ref(t, 'Vec2', 'normal'), num('offset', 'coordinate')),
    encode: (json, ctx, label) => ({
      normal: point('normal').encode(json, ctx, label),
      offset: ctx.q('coordinate', json.offset, `${label}.offset`),
    }),
    decode: (data, ctx) => ({ type: 'Hesse2', normal: dec('Vec2', data.normal, ctx), offset: data.offset }),
  },
  Polyline2: vertexList('Polyline2', 'Vec2', 'vertices', 2, MAX_VERTICES),
  Polygon2: vertexList('Polygon2', 'Vec2', 'vertices', 3, MAX_VERTICES),
  Circle2: {
    field: (t) => obj('Circle2', ref(t, 'Vec2', 'center'), num('radius', 'coordinate')),
    encode: (json, ctx, label) => ({
      center: point('center').encode(json, ctx, label),
      radius: ctx.q('coordinate', json.radius, `${label}.radius`),
    }),
    decode: (data, ctx) => ({ type: 'Circle2', center: dec('Vec2', data.center, ctx), radius: data.radius }),
  },
  TriMesh2: {
    field: (t) =>
      obj(
        'TriMesh2',
        arr('vertices', 0, MAX_VERTICES, ref(t, 'Vec2', 'vertex')),
        arr(
          'triangles',
          0,
          2 * MAX_VERTICES,
          obj(
            'triangle',
            intField('a', 0, MAX_VERTICES - 1),
            intField('b', 0, MAX_VERTICES - 1),
            intField('c', 0, MAX_VERTICES - 1),
          ),
        ),
      ),
    encode: (json, ctx, label) => ({
      vertices: (json.vertices as Json[]).map((vertex, index) =>
        enc('Vec2', vertex, ctx, `${label}.vertices[${index}]`),
      ),
      triangles: (json.triangles as number[][]).map(([a, b, c]) => ({ a, b, c })),
    }),
    decode: (data, ctx) => ({
      type: 'TriMesh2',
      vertices: (data.vertices as Data[]).map((vertex) => dec('Vec2', vertex, ctx)),
      triangles: (data.triangles as Data[]).map(({ a, b, c }) => [a, b, c]),
    }),
  },
  GridCell2: {
    field: () => obj('GridCell2', num('i', 'integer'), num('j', 'integer')),
    encode: (json, ctx, label) => ({
      i: ctx.q('integer', json.i, `${label}.i`),
      j: ctx.q('integer', json.j, `${label}.j`),
    }),
    decode: (data, ctx) => ({ type: 'GridCell2', i: data.i, j: data.j }),
  },
  Axis: {
    field: (t) => uni('Axis', 'kind', axisVariants(t)),
    encode: (json, ctx, label) => {
      const domain = json.domain === undefined ? null : enc('Interval2', json.domain, ctx, `${label}.domain`);
      switch (json.kind) {
        case 'unit':
          return { kind: 'unit', domain };
        case 'uniform':
          return { kind: 'uniform', size: ctx.q('coordinate', json.size, `${label}.size`), domain };
        default:
          return {
            kind: 'custom',
            defaultSize: ctx.q('coordinate', json.defaultSize, `${label}.defaultSize`),
            sizes: Object.entries(json.sizes as Record<string, number>).map(([index, size]) => ({
              index: ctx.q('integer', Number(index), `${label}.sizes`),
              size: ctx.q('coordinate', size, `${label}.sizes[${index}]`),
            })),
            domain,
          };
      }
    },
    decode: (data, ctx) => {
      const base = {
        type: 'Axis',
        kind: data.kind,
        ...(data.domain ? { domain: dec('Interval2', data.domain, ctx) } : {}),
      };
      if (data.kind === 'uniform') return { ...base, size: data.size };
      if (data.kind === 'custom') {
        return {
          ...base,
          defaultSize: data.defaultSize,
          sizes: Object.fromEntries((data.sizes as Data[]).map(({ index, size }) => [index, size])),
        };
      }
      return base;
    },
  },
  Grid2: {
    field: (t) =>
      obj(
        'Grid2',
        ref(t, 'Axis', 'u'),
        ref(t, 'Axis', 'v'),
        opt('frame', ref(t, 'Frame2', 'frame')),
        opt('epsilon', ref(t, 'Epsilon', 'epsilon')),
      ),
    encode: (json, ctx, label) => ({
      u: enc('Axis', json.u, ctx, `${label}.u`),
      v: enc('Axis', json.v, ctx, `${label}.v`),
      frame: json.frame ? enc('Frame2', json.frame, ctx, `${label}.frame`) : null,
      epsilon: json.epsilon ? enc('Epsilon', json.epsilon, ctx, `${label}.epsilon`) : null,
    }),
    decode: (data, ctx) => ({
      type: 'Grid2',
      u: dec('Axis', data.u, ctx),
      v: dec('Axis', data.v, ctx),
      ...(data.frame ? { frame: dec('Frame2', data.frame, ctx) } : {}),
      ...(data.epsilon ? { epsilon: dec('Epsilon', data.epsilon, ctx) } : {}),
    }),
  },
  GridLine2: twoCells('GridLine2', 'from', 'to'),
  GridPolyline2: vertexList('GridPolyline2', 'GridCell2', 'vertices', 2, MAX_CELLS),
  GridPolygon2: vertexList('GridPolygon2', 'GridCell2', 'vertices', 3, MAX_CELLS),
  GridRectangle2: twoCells('GridRectangle2', 'bottomLeft', 'topRight'),
  CellCollection: vertexList('CellCollection', 'GridCell2', 'cells', 0, MAX_CELLS),
};

export const isValueType = (type: unknown): type is ValueType => typeof type === 'string' && type in SPECS;

/** Reference to the template of one value type (registered on first use). */
export const valueRef = (table: TemplateTable, type: ValueType, name: string) => ref(table, type, name);

/** Reference to a union over every value type: `{ type, value }`. */
export function anyValueRef(table: TemplateTable, name: string): ReferenceField {
  return table.ref(name, 'value:any', () =>
    uni('value', 'type', Object.fromEntries(VALUE_TYPES.map((type) => [type, [valueRef(table, type, 'value')]]))),
  );
}

/** Codec JSON of a vec2 value → densing data of its template. */
export function encodeValueJson(json: Json, ctx: NumericContext, label = 'value'): Data {
  if (!isValueType(json.type)) throw new TypeError(`${label}: no dense template for ${String(json.type)}`);
  return enc(json.type, json, ctx, label);
}

/** densing data of a value template → codec JSON. */
export function decodeValueData(type: ValueType, data: Data, ctx: NumericContext): Json {
  return dec(type, data, ctx);
}
