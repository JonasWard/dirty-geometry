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

/** A stored vec2 value (codec JSON): a point as two numbers, anything else as JSON. */
export function ValueEditor({
  value,
  onChange,
  label,
}: {
  value: Json;
  onChange: (json: Json) => void;
  label: string;
}) {
  return value.type === 'Vec2' ? (
    <Vec2Editor value={value} onChange={onChange} label={label} />
  ) : (
    <JsonValueEditor value={value} onChange={onChange} label={label} />
  );
}
