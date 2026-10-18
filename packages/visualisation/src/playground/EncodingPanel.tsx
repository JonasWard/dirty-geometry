'use client';

import { useState } from 'react';
import { ROLES as NUMERIC_ROLES, type Role as NumericRole } from '@dirty-geometry/vec2/schema/schema';
import type { DenseDefinitionSchema } from '@dirty-geometry/vec2/schema/dense/definition';
import type { NumericPreset as CustomPreset } from 'densing';
import type { ActivePresets, NumericOptions } from '@dirty-geometry/vec2/schema/dense/numerics';
import { presetBits } from './presets';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3 text-xs';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';
const input =
  'rounded border border-dg-border bg-white px-1.5 py-0.5 font-mono text-xs text-dg-ink focus:border-dg-steel-600 focus:outline-none';

export type EncodingStats = {
  jsonBytes: number;
  hash?: string;
  error?: string;
  changes: readonly string[];
};

export function EncodingPanel({
  schema,
  options,
  presets,
  auto,
  stats,
  onPresets,
  onAuto,
  onOptions,
  onSnap,
}: {
  schema: DenseDefinitionSchema;
  options: NumericOptions;
  presets: ActivePresets;
  /** Whether presets follow the definition automatically. */
  auto: boolean;
  stats: EncodingStats;
  onPresets: (presets: ActivePresets) => void;
  onAuto: (auto: boolean) => void;
  onOptions: (options: NumericOptions) => void;
  onSnap: () => void;
}) {
  const [role, setRole] = useState<NumericRole>('coordinate');
  const [draft, setDraft] = useState({ name: '', min: '', max: '', precision: '' });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const definitions = schema.schema.definitions ?? [];
  const addCustom = () => {
    const preset: CustomPreset = {
      min: Number(draft.min),
      max: Number(draft.max),
      ...(draft.precision ? { precision: Number(draft.precision) } : {}),
    };
    if (
      !draft.name.trim() ||
      [preset.min, preset.max, preset.precision ?? 1].some((value) => !Number.isFinite(value))
    ) {
      setError('name, min and max are required; precision is optional (integers)');
      return;
    }
    const custom = {
      ...(options.custom ?? {}),
      [role]: { ...(options.custom?.[role] ?? {}), [draft.name.trim()]: preset },
    };
    setError(null);
    onOptions({ custom });
    onPresets({ ...presets, [role]: draft.name.trim() });
    setDraft({ name: '', min: '', max: '', precision: '' });
  };

  const removeCustom = (customRole: NumericRole, name: string) => {
    const rest = { ...(options.custom?.[customRole] ?? {}) };
    delete rest[name];
    onOptions({ custom: { ...(options.custom ?? {}), [customRole]: rest } });
    if (presets[customRole] === name) {
      const next = { ...presets };
      delete next[customRole];
      onPresets(next);
    }
  };

  const url =
    typeof window === 'undefined' || !stats.hash
      ? ''
      : `${window.location.origin}${window.location.pathname}#/${stats.hash}`;

  return (
    <section className={panel} aria-label='Encoding'>
      <div className='mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1'>
        <h3 className='text-xs font-bold tracking-widest text-dg-subtle uppercase'>densing</h3>
        <span>
          JSON <b>{stats.jsonBytes.toLocaleString()}</b> B
        </span>
        <span>
          dense <b data-testid='dense-length'>{stats.hash ? stats.hash.length : '—'}</b> chars
        </span>
        {stats.hash && <span>{((1 - stats.hash.length / stats.jsonBytes) * 100).toFixed(0)}% smaller</span>}
        <button
          type='button'
          className={`${button} ml-auto`}
          disabled={!url}
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <div className='grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1'>
        {NUMERIC_ROLES.map((numericRole) => {
          const definition = definitions.find((candidate) => candidate.name === numericRole);
          const active = presets[numericRole] ?? definition?.defaultPreset ?? '';
          return (
            <label key={numericRole} className='contents'>
              <span className='font-mono text-dg-subtle'>{numericRole}</span>
              <select
                aria-label={`${numericRole} preset`}
                className={input}
                value={active}
                onChange={(event) => onPresets({ ...presets, [numericRole]: event.target.value })}
              >
                {Object.entries(definition?.presets ?? {}).map(([name, preset]) => (
                  <option key={name} value={name}>
                    {name} · [{preset.min}, {preset.max}] · {presetBits(preset)} bits
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <div className='mt-2 flex flex-wrap gap-2'>
        <label className='flex items-center gap-1'>
          <input
            aria-label='automatic presets'
            type='checkbox'
            checked={auto}
            onChange={(event) => onAuto(event.target.checked)}
          />
          auto: cheapest exact presets, following every edit
        </label>
        <button type='button' className={button} onClick={onSnap} disabled={stats.changes.length === 0}>
          Snap definition to presets
        </button>
      </div>

      {stats.error && <div className='mt-2 text-red-600'>Cannot encode: {stats.error}</div>}
      {stats.changes.length > 0 && (
        <div className='mt-2 text-amber-700'>
          {stats.changes.length} literal{stats.changes.length === 1 ? '' : 's'} change under these presets:
          <ul className='list-disc pl-5 font-mono'>
            {stats.changes.slice(0, 5).map((change) => (
              <li key={change}>{change}</li>
            ))}
            {stats.changes.length > 5 && <li>…</li>}
          </ul>
        </div>
      )}

      <form
        className='mt-3 flex flex-wrap items-center gap-1 border-t border-dg-border pt-2'
        aria-label='Custom preset'
        onSubmit={(event) => {
          event.preventDefault();
          addCustom();
        }}
      >
        <span className='text-dg-subtle'>custom preset</span>
        <select
          aria-label='custom preset role'
          className={input}
          value={role}
          onChange={(event) => setRole(event.target.value as NumericRole)}
        >
          {NUMERIC_ROLES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        {(['name', 'min', 'max', 'precision'] as const).map((key) => (
          <input
            key={key}
            aria-label={`custom preset ${key}`}
            className={`${input} ${key === 'name' ? 'w-20' : 'w-16'}`}
            placeholder={key}
            value={draft[key]}
            onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          />
        ))}
        <button type='submit' className={button}>
          + add
        </button>
        {error && <span className='text-red-600'>{error}</span>}
      </form>
      {NUMERIC_ROLES.flatMap((customRole) =>
        Object.entries(options.custom?.[customRole] ?? {}).map(([name, preset]) => (
          <div key={`${customRole}:${name}`} className='mt-1 flex items-center gap-2 font-mono'>
            <span>
              {customRole}/{name}: [{preset.min}, {preset.max}] @ {preset.precision ?? 1}
            </span>
            <button type='button' className={button} onClick={() => removeCustom(customRole, name)}>
              remove
            </button>
          </div>
        )),
      )}
    </section>
  );
}
