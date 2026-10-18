'use client';

/** Small editors for literal values: numbers that may be typed half-way, and stored vec2 values. */
import { useEffect, useState } from 'react';

const inputClass =
  'rounded border border-dg-border bg-white px-1.5 py-0.5 font-mono text-xs text-dg-ink focus:border-dg-steel-600 focus:outline-none';
export const selectClass = `${inputClass} max-w-full`;
export { inputClass };

/** A number input that keeps what the user types until it parses (so "-", "1." and "Infinity" can be typed). */
export function NumberInput({
  value,
  onChange,
  step,
  label,
  allowNonFinite = false,
  narrow = false,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  label: string;
  allowNonFinite?: boolean;
  /** Sized to short numbers, for inline use in expressions. */
  narrow?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value && !(Number.isNaN(value) && text === 'NaN')) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      aria-label={label}
      className={`${inputClass} ${narrow ? 'w-14 py-px text-[11px]' : 'w-20'}`}
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
