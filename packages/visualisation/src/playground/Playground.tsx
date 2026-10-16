'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluateDefinition } from '@dirty-geometry/vec2/recording/replay';
import { createDefinitionSchema } from '@dirty-geometry/vec2-dense/definition-schema';
import { decodeDefinition, encodeDefinition, quantisationReport } from '@dirty-geometry/vec2-dense/convert';
import { resolvePreset, type ActivePresets, type NumericOptions } from '@dirty-geometry/vec2-dense/numerics';
import { choosePresets } from '@dirty-geometry/vec2-dense/presets';
import type { OperandRole } from '@dirty-geometry/vec2-dense/roles';
import { decodePlaygroundHash, encodePlaygroundHash } from '@dirty-geometry/vec2-dense/url';
import { VisualisationLegend } from '../core/VisualisationLegend';
import { Builder } from './Builder';
import { validateDefinition } from './editing';
import { EncodingPanel, type EncodingStats } from './EncodingPanel';
import { JsonEditor } from './JsonEditor';
import { PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { STARTERS } from './starters';
import { TypeScriptEditor } from './TypeScriptEditor';

/** `auto`: presets follow the definition (cheapest exact ones) until the user picks one. */
type State = { definition: Definition; options: NumericOptions; presets: ActivePresets; auto: boolean };

const tab = (active: boolean) =>
  `border px-3 py-1 text-xs tracking-widest uppercase ${
    active
      ? 'border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200'
      : 'border-dg-border text-dg-subtle hover:border-dg-steel-600'
  }`;

function initialState(): { state: State; error?: string } {
  const fallback: State = { definition: STARTERS[0]!.build(), options: {}, presets: {}, auto: true };
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  if (!hash.replace(/^#\/?/, '')) return { state: fallback };
  try {
    // A shared link keeps the presets it was written with.
    return { state: { ...decodePlaygroundHash(hash), auto: false } };
  } catch (error) {
    return { state: fallback, error: `Could not read the link: ${(error as Error).message}` };
  }
}

/**
 * The vec2 playground: build a definition with dropdowns or as JSON, edit it as TypeScript, see every
 * intermediate geometry, and keep it all in the URL as a densing string.
 */
export function Playground() {
  const initial = useMemo(initialState, []);
  const [state, setState] = useState<State>(initial.state);
  const [loadError, setLoadError] = useState(initial.error);
  const [mode, setMode] = useState<'builder' | 'json'>('builder');
  const [selected, setSelected] = useState<string | null>(null);
  const { definition, options, auto } = state;

  const schema = useMemo(() => createDefinitionSchema(options), [options]);
  const presets = useMemo(
    () => (auto ? choosePresets(definition, {}, schema) : state.presets),
    [auto, definition, schema, state.presets],
  );
  const setDefinition = (next: Definition) => setState((current) => ({ ...current, definition: next }));

  const evaluation = useMemo(() => {
    try {
      return evaluateDefinition(definition, { partial: true });
    } catch (error) {
      return {
        outputs: {},
        values: new Map<string, unknown>(),
        error: { node: '', message: (error as Error).message },
      };
    }
  }, [definition]);
  const issues = useMemo(() => validateDefinition(definition), [definition]);

  const stats = useMemo((): EncodingStats => {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(definition)).length;
    try {
      const hash = encodePlaygroundHash({ definition, options, presets });
      return { jsonBytes, hash, changes: quantisationReport(definition, presets, schema) };
    } catch (error) {
      return { jsonBytes, error: (error as Error).message, changes: [] };
    }
  }, [definition, options, presets, schema]);

  // Keep the URL in step with the state (debounced), without adding history entries.
  const lastHash = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!stats.hash || stats.hash === lastHash.current) return;
    const timer = setTimeout(() => {
      lastHash.current = stats.hash;
      window.history.replaceState(null, '', `#/${stats.hash}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [stats.hash]);

  // A different link pasted into this tab (only hashes this page did not write itself).
  useEffect(() => {
    const onHashChange = () => {
      const current = window.location.hash.replace(/^#\/?/, '');
      if (!current || current === lastHash.current) return;
      try {
        const next = decodePlaygroundHash(current);
        lastHash.current = current;
        setState({ ...next, auto: false });
        setSelected(null);
        setLoadError(undefined);
      } catch (error) {
        setLoadError(`Could not read the link: ${(error as Error).message}`);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const step = (role: OperandRole) => {
    if (role === 'epsilon') return undefined;
    try {
      return resolvePreset(schema.schema.definitions ?? [], role, presets).precision ?? 1;
    } catch {
      return undefined;
    }
  };

  return (
    <div className='space-y-3'>
      {loadError && (
        <div className='rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700'>
          {loadError}{' '}
          <button type='button' className='underline' onClick={() => setLoadError(undefined)}>
            dismiss
          </button>
        </div>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex gap-1' role='tablist' aria-label='Editor mode'>
          <button
            type='button'
            role='tab'
            aria-selected={mode === 'builder'}
            className={tab(mode === 'builder')}
            onClick={() => setMode('builder')}
          >
            Builder
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={mode === 'json'}
            className={tab(mode === 'json')}
            onClick={() => setMode('json')}
          >
            JSON
          </button>
        </div>
        <label className='ml-auto flex items-center gap-1 text-xs text-dg-subtle'>
          start from
          <select
            aria-label='starter'
            className='rounded border border-dg-border bg-white px-1.5 py-0.5 text-xs text-dg-ink'
            value=''
            onChange={(event) => {
              const starter = STARTERS.find((candidate) => candidate.id === event.target.value);
              if (!starter) return;
              const next = starter.build();
              setState({ definition: next, options: {}, presets: {}, auto: true });
              setSelected(null);
            }}
          >
            <option value=''>choose…</option>
            {STARTERS.map((starter) => (
              <option key={starter.id} value={starter.id}>
                {starter.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'>
        <div className='min-w-0 space-y-4'>
          {mode === 'builder' ? (
            <Builder
              definition={definition}
              values={evaluation.values}
              issues={issues}
              failure={evaluation.error}
              selected={selected}
              step={step}
              onSelect={setSelected}
              onChange={setDefinition}
            />
          ) : (
            <JsonEditor definition={definition} onChange={setDefinition} />
          )}
          <TypeScriptEditor definition={definition} onChange={setDefinition} />
        </div>

        <div className='min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start'>
          <div className='relative h-[60vh] min-h-[420px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]'>
            <PlaygroundCanvas definition={definition} values={evaluation.values} selected={selected} />
            <VisualisationLegend
              items={[
                { color: PLAYGROUND_COLORS.intermediate, label: 'Intermediate geometry', shape: 'line' },
                { color: PLAYGROUND_COLORS.outputs[0], label: 'Outputs (one colour each)', shape: 'line' },
                { color: PLAYGROUND_COLORS.selected, label: 'Selected node', shape: 'line' },
              ]}
            />
          </div>
          {evaluation.error && (
            <div className='text-xs text-red-600'>
              {evaluation.error.node ? `${evaluation.error.node}: ` : ''}
              {evaluation.error.message}
            </div>
          )}
          <EncodingPanel
            schema={schema}
            options={options}
            presets={presets}
            auto={auto}
            stats={stats}
            onPresets={(next) => setState((current) => ({ ...current, presets: next, auto: false }))}
            onOptions={(next) => setState((current) => ({ ...current, options: next }))}
            onAuto={(next) =>
              setState((current) => ({ ...current, auto: next, presets: next ? current.presets : presets }))
            }
            onSnap={() => {
              try {
                setDefinition(decodeDefinition(encodeDefinition(definition, presets, schema), schema).definition);
              } catch {
                // the encoding panel already shows why it cannot encode
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default Playground;
