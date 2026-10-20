'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefinitionSchema,
  decodeDefinition,
  encodeDefinition,
} from '@dirty-geometry/vec2/schema/dense/definition';
import { VisualisationLegend } from '../core/VisualisationLegend';
import { CodeEditor } from './CodeEditor';
import { EncodingPanel } from './EncodingPanel';
import { JsonEditor } from './JsonEditor';
import { CellsPanel, FunctionsPanel, InputsPanel } from './panels';
import { PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { STARTERS } from './starters';
import { currentHash, initialDocument } from './location';
import { createPlaygroundStore, StoreContext, useAnalysis, usePlayground, useStoreApi } from './store';
import { isLegacyHash, readPlaygroundHash } from './url';

type Mode = 'cells' | 'code' | 'json';
const MODES: Record<Mode, string> = { cells: 'Cells', code: 'Code', json: 'JSON' };
const tab = (active: boolean) =>
  `border px-3 py-1 text-xs tracking-widest uppercase ${
    active
      ? 'border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200'
      : 'border-dg-border text-dg-subtle hover:border-dg-steel-600'
  }`;
const button =
  'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 disabled:opacity-40';

/**
 * The vec2 playground: a definition is inputs, functions and cells, each cell one expression edited in place (or as
 * code, or as JSON). Every cell's geometry is drawn, and the whole definition lives in the link as a densing string.
 */
export function Playground({ viewerHref }: { viewerHref?: string } = {}) {
  const [{ store, error }] = useState(() => {
    const { document, error } = initialDocument();
    return { store: createPlaygroundStore(document), error };
  });
  return (
    <StoreContext.Provider value={store}>
      <PlaygroundView initialError={error} viewerHref={viewerHref} />
    </StoreContext.Provider>
  );
}

function PlaygroundView({ initialError, viewerHref }: { initialError?: string; viewerHref?: string }) {
  const store = useStoreApi();
  const definition = usePlayground((s) => s.definition);
  const options = usePlayground((s) => s.options);
  const active = usePlayground((s) => s.active);
  const auto = usePlayground((s) => s.auto);
  const encoding = usePlayground((s) => s.encoding);
  const selected = usePlayground((s) => s.selected);
  const canUndo = usePlayground((s) => s.past.length > 0);
  const canRedo = usePlayground((s) => s.future.length > 0);
  const [mode, setMode] = useState<Mode>('cells');
  const [notice, setNotice] = useState<string | undefined>(initialError);
  const { analysis, evaluation } = useAnalysis(definition);
  const schema = useMemo(() => createDefinitionSchema(options), [options]);
  const lastHash = useRef<string | undefined>(undefined);

  // A link: version 4 is already loaded; an older one is read (its decoder loads on demand) and upgraded.
  const open = (hash: string, mode: 'push' | 'reset') =>
    readPlaygroundHash(hash).then(
      (state) => {
        lastHash.current = hash;
        store.getState().load({ ...state, auto: false }, mode);
        setNotice(state.upgraded ? 'This link was made by an earlier playground; its steps are now cells.' : undefined);
      },
      (failure: Error) => setNotice(`Could not read the link: ${failure.message}`),
    );
  useEffect(() => {
    const hash = currentHash();
    if (hash && isLegacyHash(hash)) void open(hash, 'reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in step (debounced), without adding history entries.
  useEffect(() => {
    if (!encoding.hash || encoding.hash === lastHash.current) return;
    const timer = setTimeout(() => {
      lastHash.current = encoding.hash;
      window.history.replaceState(null, '', `#/${encoding.hash}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [encoding.hash]);

  // A different link pasted into this tab (only hashes this page did not write itself).
  useEffect(() => {
    const onHashChange = () => {
      const hash = currentHash();
      if (hash && hash !== lastHash.current) void open(hash, 'push');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo and redo, unless a text field has the keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) store.getState().redo();
      else store.getState().undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const commit = (next: typeof definition) => store.getState().commit(next);
  return (
    <div className='space-y-3'>
      {notice && (
        <div className='rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
          {notice}{' '}
          <button type='button' className='underline' onClick={() => setNotice(undefined)}>
            dismiss
          </button>
        </div>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex gap-1' role='tablist' aria-label='Editor mode'>
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button
              key={m}
              type='button'
              role='tab'
              aria-selected={mode === m}
              className={tab(mode === m)}
              onClick={() => setMode(m)}
            >
              {MODES[m]}
            </button>
          ))}
        </div>
        <button
          type='button'
          className={button}
          disabled={!canUndo}
          onClick={() => store.getState().undo()}
          title='Ctrl+Z'
        >
          ↶ undo
        </button>
        <button
          type='button'
          className={button}
          disabled={!canRedo}
          onClick={() => store.getState().redo()}
          title='Ctrl+Shift+Z'
        >
          ↷ redo
        </button>
        <label className='ml-auto flex items-center gap-1 text-xs text-dg-subtle'>
          start from
          <select
            aria-label='starter'
            className='rounded border border-dg-border bg-white px-1.5 py-0.5 text-xs text-dg-ink'
            value=''
            onChange={(event) => {
              const chosen = STARTERS.find((candidate) => candidate.id === event.target.value);
              if (chosen) store.getState().load({ definition: chosen.build(), options: {}, presets: {}, auto: true });
            }}
          >
            <option value=''>choose…</option>
            {STARTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {viewerHref && (
          <a
            className={button}
            href={encoding.hash ? `${viewerHref}#/${encoding.hash}` : viewerHref}
            title='Play with the inputs of this definition'
          >
            open viewer ↗
          </a>
        )}
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]'>
        <div className='min-w-0 space-y-4'>
          {mode === 'cells' && (
            <>
              <InputsPanel analysis={analysis} />
              <FunctionsPanel analysis={analysis} />
              <CellsPanel analysis={analysis} evaluation={evaluation} />
            </>
          )}
          {mode === 'code' && <CodeEditor definition={definition} onChange={commit} />}
          {mode === 'json' && <JsonEditor definition={definition} onChange={commit} />}
        </div>

        <div className='min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start'>
          <div className='relative h-[60vh] min-h-[420px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]'>
            <PlaygroundCanvas definition={definition} evaluation={evaluation} selected={selected} />
            <VisualisationLegend
              items={[
                { color: PLAYGROUND_COLORS.intermediate, label: 'Cells', shape: 'line' },
                { color: PLAYGROUND_COLORS.outputs[0], label: 'Outputs (one colour each)', shape: 'line' },
                { color: PLAYGROUND_COLORS.selected, label: 'Selected (click a name)', shape: 'line' },
              ]}
            />
          </div>
          <EncodingPanel
            schema={schema}
            options={options}
            presets={active}
            auto={auto}
            stats={encoding}
            onPresets={(next) => store.getState().update({ presets: next, auto: false })}
            onOptions={(next) => store.getState().update({ options: next })}
            onAuto={(next) =>
              store.getState().update({ auto: next, presets: next ? store.getState().presets : active })
            }
            onSnap={() => {
              try {
                commit(decodeDefinition(encodeDefinition(definition, active, schema), schema).definition);
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
