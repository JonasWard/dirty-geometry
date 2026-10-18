'use client';

import { useEffect, useState } from 'react';
import type { Arg } from '@dirty-geometry/vec2/recording/definition';
import { slotType, type Type } from '@dirty-geometry/vec2/schema/schema';
import { DEFAULT_VALUES, defaultLiteral, literalShape, type LiteralShape } from './defaults';
import { argOf, sourceKey } from './editing';

export type NodeChoice = { id: string; label: string };

const inputClass =
  'rounded border border-dg-border bg-white px-1.5 py-0.5 font-mono text-xs text-dg-ink focus:border-dg-steel-600 focus:outline-none';
const selectClass = `${inputClass} max-w-full`;

/** A number input that keeps what the user types until it parses (so "-", "1." and "Infinity" can be typed). */
export function NumberInput({
  value,
  onChange,
  step,
  label,
  allowNonFinite = false,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  label: string;
  allowNonFinite?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value && !(Number.isNaN(value) && text === 'NaN')) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      aria-label={label}
      className={`${inputClass} w-20`}
      inputMode='decimal'
      value={text}
      step={step}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value);
        if (
          event.target.value.trim() !== '' &&
          (Number.isFinite(parsed) || (allowNonFinite && !Number.isNaN(parsed)))
        ) {
          onChange(parsed);
        }
      }}
    />
  );
}

type Json = Record<string, any>;

function Vec2Editor({ value, onChange, label }: { value: Json; onChange: (json: Json) => void; label: string }) {
  return (
    <span className='inline-flex items-center gap-1'>
      <span className='text-dg-subtle'>(</span>
      <NumberInput label={`${label} x`} value={value.x} onChange={(x) => onChange({ ...value, x })} />
      <NumberInput label={`${label} y`} value={value.y} onChange={(y) => onChange({ ...value, y })} />
      <span className='text-dg-subtle'>)</span>
    </span>
  );
}

function VertexListEditor({
  value,
  onChange,
  label,
  min,
}: {
  value: Json;
  onChange: (json: Json) => void;
  label: string;
  min: number;
}) {
  const vertices = value.vertices as Json[];
  return (
    <div className='space-y-1'>
      {vertices.map((vertex, index) => (
        <div key={index} className='flex items-center gap-1'>
          <span className='w-5 text-right text-dg-subtle'>{index}</span>
          <Vec2Editor
            label={`${label} vertex ${index}`}
            value={vertex}
            onChange={(next) =>
              onChange({ ...value, vertices: vertices.map((item, i) => (i === index ? next : item)) })
            }
          />
          <button
            type='button'
            className='px-1 text-dg-subtle hover:text-red-600 disabled:opacity-30'
            disabled={vertices.length <= min}
            aria-label={`remove vertex ${index}`}
            onClick={() => onChange({ ...value, vertices: vertices.filter((_, i) => i !== index) })}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type='button'
        className='text-dg-steel-600 hover:underline'
        onClick={() => {
          const last = vertices[vertices.length - 1] ?? { type: 'Vec2', x: 0, y: 0 };
          onChange({ ...value, vertices: [...vertices, { ...last, x: last.x + 1 }] });
        }}
      >
        + vertex
      </button>
    </div>
  );
}

/** Raw codec JSON for value types without a dedicated form. */
function JsonValueEditor({ value, onChange, label }: { value: Json; onChange: (json: Json) => void; label: string }) {
  const [text, setText] = useState(JSON.stringify(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(JSON.stringify(value)), [value]);
  return (
    <span className='inline-flex flex-col'>
      <textarea
        aria-label={label}
        className={`${inputClass} h-16 w-64`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.type !== value.type) throw new Error(`expected a ${value.type}`);
            setError(null);
            onChange(parsed);
          } catch (failure) {
            setError((failure as Error).message);
          }
        }}
      />
      {error && <span className='text-red-600'>{error}</span>}
    </span>
  );
}

/** Form for a stored vec2 value (codec JSON). */
export function ValueEditor({
  value,
  onChange,
  label,
}: {
  value: Json;
  onChange: (json: Json) => void;
  label: string;
}) {
  switch (value.type) {
    case 'Vec2':
      return <Vec2Editor value={value} onChange={onChange} label={label} />;
    case 'Line2':
    case 'Ray2':
    case 'InfiniteLine2': {
      const [a, b] =
        value.type === 'Line2'
          ? ['from', 'to']
          : value.type === 'Ray2'
            ? ['start', 'direction']
            : ['through', 'direction'];
      return (
        <span className='inline-flex flex-wrap items-center gap-1'>
          <span className='text-dg-subtle'>{a}</span>
          <Vec2Editor
            label={`${label} ${a}`}
            value={value[a!]}
            onChange={(next) => onChange({ ...value, [a!]: next })}
          />
          <span className='text-dg-subtle'>{b}</span>
          <Vec2Editor
            label={`${label} ${b}`}
            value={value[b!]}
            onChange={(next) => onChange({ ...value, [b!]: next })}
          />
        </span>
      );
    }
    case 'Circle2':
      return (
        <span className='inline-flex flex-wrap items-center gap-1'>
          <span className='text-dg-subtle'>center</span>
          <Vec2Editor
            label={`${label} center`}
            value={value.center}
            onChange={(center) => onChange({ ...value, center })}
          />
          <span className='text-dg-subtle'>r</span>
          <NumberInput
            label={`${label} radius`}
            value={value.radius}
            onChange={(radius) => onChange({ ...value, radius })}
          />
        </span>
      );
    case 'Polygon2':
    case 'Polyline2':
      return (
        <VertexListEditor value={value} onChange={onChange} label={label} min={value.type === 'Polygon2' ? 3 : 2} />
      );
    case 'Epsilon':
      return <NumberInput label={label} value={value.value} onChange={(next) => onChange({ ...value, value: next })} />;
    default:
      return <JsonValueEditor value={value} onChange={onChange} label={label} />;
  }
}

/** The forms an operand of `type` can take, as kind keys for the kind dropdown. */
function operandKinds(shape: LiteralShape, optional: boolean): string[] {
  return [
    'node',
    ...(optional ? ['omit'] : []),
    ...(shape.number ? ['number'] : []),
    ...(shape.boolean ? ['boolean'] : []),
    ...(shape.choices?.length ? ['choice'] : []),
    ...(shape.string ? ['string'] : []),
    ...(shape.null ? ['null'] : []),
    ...(shape.values ?? []).map((value) => `value:${value}`),
    ...(shape.array ? ['list'] : []),
    ...(shape.object ? ['object'] : []),
  ];
}

function kindOf(arg: Arg | undefined, shape: LiteralShape): string {
  if (arg === undefined) return 'omit';
  if (arg === null || typeof arg !== 'object') {
    if (shape.choices?.includes(arg as string)) return 'choice';
    return arg === null ? 'null' : typeof arg === 'number' ? 'number' : typeof arg;
  }
  if (Array.isArray(arg)) return 'list';
  if ('ref' in arg || 'param' in arg) return 'node';
  if ('value' in arg) return `value:${String((arg.value as Json)?.type)}`;
  return 'omit' in arg ? 'omit' : 'number' in arg ? 'number' : 'object';
}

const KIND_LABELS: Record<string, string> = { string: 'text', object: 'options' };

function initialArg(kind: string, type: Type, nodes: readonly NodeChoice[]): Arg {
  const shape = literalShape(type);
  if (kind === 'node') return argOf(nodes.at(-1)?.id ?? '');
  if (kind === 'omit') return { omit: true };
  if (kind === 'number') return defaultLiteral(shape.number ?? 'coordinate')!;
  if (kind === 'choice') return shape.choices![0]!;
  const literals: Record<string, Arg> = { boolean: false, string: '', null: null, list: [], object: { object: {} } };
  return kind in literals ? literals[kind]! : { value: DEFAULT_VALUES[kind.slice(6)] ?? DEFAULT_VALUES.Vec2 };
}

/** Edit one operand: pick its kind (an earlier node or a param, omitted, or a literal form) and its value. */
export function OperandEditor({
  name,
  type,
  optional,
  arg,
  nodes,
  step,
  onChange,
}: {
  name: string;
  type: Type;
  optional: boolean;
  arg: Arg | undefined;
  /** Params and the nodes this operand may refer to (the ones before its node). */
  nodes: readonly NodeChoice[];
  /** Input step for numbers (the active preset's precision). */
  step: (numberType: string) => number | undefined;
  onChange: (arg: Arg) => void;
}) {
  const shape = literalShape(type);
  const kinds = operandKinds(shape, optional);
  const kind = kindOf(arg, shape);
  const label = `${name}`;
  const value = arg && typeof arg === 'object' && 'number' in arg ? Number(arg.number) : arg;

  let editor: React.ReactNode = null;
  if (kind === 'node') {
    const current = arg && typeof arg === 'object' && 'ref' in arg ? arg.ref : sourceKey(arg as { param: string });
    editor = (
      <select
        aria-label={`${label} node`}
        className={selectClass}
        value={current}
        onChange={(event) => onChange(argOf(event.target.value))}
      >
        {!nodes.some((node) => node.id === current) && (
          <option value={current}>{current || 'pick a node'} (missing)</option>
        )}
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.label}
          </option>
        ))}
      </select>
    );
  } else if (typeof value === 'number') {
    editor = (
      <NumberInput
        label={label}
        value={value}
        step={step(shape.number ?? 'coordinate')}
        allowNonFinite
        onChange={(next) => onChange(Number.isFinite(next) ? next : { number: String(next) as 'Infinity' })}
      />
    );
  } else if (typeof value === 'boolean') {
    editor = (
      <input aria-label={label} type='checkbox' checked={value} onChange={(event) => onChange(event.target.checked)} />
    );
  } else if (kind === 'choice') {
    editor = (
      <select
        aria-label={label}
        className={selectClass}
        value={String(value)}
        onChange={(event) => onChange(shape.choices!.find((choice) => String(choice) === event.target.value)!)}
      >
        {shape.choices!.map((choice) => (
          <option key={String(choice)} value={String(choice)}>
            {String(choice)}
          </option>
        ))}
      </select>
    );
  } else if (typeof value === 'string') {
    editor = (
      <input
        aria-label={label}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (arg && typeof arg === 'object' && 'value' in arg) {
    editor = <ValueEditor label={label} value={arg.value as Json} onChange={(json) => onChange({ value: json })} />;
  } else if (Array.isArray(arg) && shape.array) {
    editor = (
      <div className='space-y-1 border-l border-dg-border pl-2'>
        {arg.map((item, index) => (
          <div key={index} className='flex items-start gap-1'>
            <span className='w-5 pt-0.5 text-right text-dg-subtle'>{index}</span>
            <OperandEditor
              name={`${name}[${index}]`}
              type={shape.array!}
              optional={false}
              arg={item}
              nodes={nodes}
              step={step}
              onChange={(next) => onChange(arg.map((current, i) => (i === index ? next : current)))}
            />
            <button
              type='button'
              className='px-1 text-dg-subtle hover:text-red-600'
              aria-label={`remove ${name}[${index}]`}
              onClick={() => onChange(arg.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type='button'
          className='text-dg-steel-600 hover:underline'
          onClick={() =>
            onChange([...arg, arg.at(-1) ?? defaultLiteral(shape.array!) ?? argOf(nodes.at(-1)?.id ?? '')])
          }
        >
          + item
        </button>
      </div>
    );
  } else if (arg && typeof arg === 'object' && 'object' in arg && shape.object) {
    const fields = arg.object;
    editor = (
      <div className='space-y-1 border-l border-dg-border pl-2'>
        {Object.entries(shape.object).map(([field, slot]) => (
          <div key={field} className='flex flex-wrap items-center gap-1'>
            <span className='font-mono text-dg-subtle'>{field}</span>
            <OperandEditor
              name={`${name}.${field}`}
              type={slotType(slot)}
              optional
              arg={fields[field]}
              nodes={nodes}
              step={step}
              onChange={(next) => {
                const { [field]: _, ...rest } = fields;
                onChange({
                  object: next && typeof next === 'object' && 'omit' in next ? rest : { ...rest, [field]: next },
                });
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <span className='inline-flex flex-wrap items-start gap-1'>
      <select
        aria-label={`${label} kind`}
        className={selectClass}
        value={kinds.includes(kind) ? kind : kinds[0]}
        onChange={(event) => onChange(initialArg(event.target.value, type, nodes))}
      >
        {kinds.map((option) => (
          <option key={option} value={option}>
            {option.startsWith('value:') ? option.slice(6) : (KIND_LABELS[option] ?? option)}
          </option>
        ))}
      </select>
      {editor}
    </span>
  );
}
