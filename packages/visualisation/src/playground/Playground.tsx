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
import { ModeSwitch, tab } from './ModeSwitch';
import { CellsPanel, FunctionsPanel, InputsPanel } from './panels';
import { PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { STARTERS } from './starters';
import { initialDocument } from './location';
import { createPlaygroundStore, StoreContext, useAnalysis, usePlayground, useStoreApi } from './store';
import { encodeViewerValues, formatHash, isLegacyHash, parseHash, readPlaygroundHash, type View } from './url';
import { changedInputs, readValues, ViewerPanel, type Values } from './Viewer';

type Mode = 'cells' | 'code' | 'json';
const MODES: Record<Mode, string> = { cells: 'Cells', code: 'Code', json: 'JSON' };
const button =
  'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 disabled:opacity-40';

/**
 * The vec2 playground: a definition is inputs, functions and cells, each cell one expression edited in place (or as
 * code, or as JSON). Every cell's geometry is drawn, and the whole definition lives in the link as a densing string.
 * Its View tab leaves only the inputs' values to change. The link names the view: `#/edit/<definition>`, or
 * `#/view/<definition>/<values>` with the changed values after the definition (which keeps the editor's values).
 */
export function Playground() {
  const [initial] = useState(() => {
    const parsed = parseHash(typeof window === 'undefined' ? '' : window.location.hash);
    const { document, error } = initialDocument(parsed.state);
    const read = readValues(parsed.values, document.options);
    return { store: createPlaygroundStore(document), parsed, values: read.values, error: error ?? read.error };
  });
  return (
    <StoreContext.Provider value={initial.store}>
      <PlaygroundView
        initialError={initial.error}
        initialView={initial.parsed.view}
        initialValues={initial.values}
        legacy={isLegacyHash(initial.parsed.state) ? initial.parsed.state : undefined}
      />
    </StoreContext.Provider>
  );
}

function PlaygroundView({
  initialError,
  initialView,
  initialValues,
  legacy,
}: {
  initialError?: string;
  initialView: View;
  initialValues: Values;
  /** An older link, read once the page is up. */
  legacy?: string;
}) {
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
  const [view, setView] = useState<View>(initialView);
  const [values, setValues] = useState<Values>(initialValues);
  const [notice, setNotice] = useState<string | undefined>(initialError);
  const { analysis, evaluation } = useAnalysis(definition);
  const schema = useMemo(() => createDefinitionSchema(options), [options]);
  // What this page last wrote to (or read from) the URL, and in which view.
  const lastHash = useRef(typeof window === 'undefined' ? '' : window.location.hash);
  const lastView = useRef(initialView);
  // Bumped when the URL was changed from outside, so it is rewritten in the current form.
  const [visited, setVisited] = useState(0);

  // The viewer's changed values, and the link they are kept in (a value no range holds keeps the last link).
  const changed = useMemo(() => changedInputs(definition, values), [definition, values]);
  const stored = useMemo((): { text?: string; error?: string } => {
    if (view !== 'view' || changed.length === 0) return {};
    try {
      return { text: encodeViewerValues(options, changed) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [view, changed, options]);
  const target = encoding.hash && !stored.error ? formatHash(view, encoding.hash, stored.text) : undefined;

  // A link's definition: version 4 is read at once; an older one is read (its decoder loads on demand) and upgraded.
  const open = (state: string, mode: 'push' | 'reset') =>
    readPlaygroundHash(state).then(
      (read) => {
        store.getState().load({ ...read, auto: false }, mode);
        setNotice(read.upgraded ? 'This link was made by an earlier playground; its steps are now cells.' : undefined);
        return read;
      },
      (failure: Error) => {
        setNotice(`Could not read the link: ${failure.message}`);
        return undefined;
      },
    );
  useEffect(() => {
    if (legacy) void open(legacy, 'reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in step: switching the view adds a history entry (so Back switches back), edits replace it.
  useEffect(() => {
    if (!target || target === lastHash.current) return;
    const write = (push: boolean) => {
      lastHash.current = target;
      lastView.current = view;
      if (push) window.history.pushState(null, '', target);
      else window.history.replaceState(null, '', target);
    };
    if (view !== lastView.current) return write(true);
    const timer = setTimeout(() => write(false), 300);
    return () => clearTimeout(timer);
  }, [target, view, visited]);

  // Back, forward, or a link pasted into this tab (only hashes this page did not write itself).
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (hash === lastHash.current) return;
      lastHash.current = hash;
      const parsed = parseHash(hash);
      lastView.current = parsed.view;
      setView(parsed.view);
      const take = (loadedOptions: typeof options) => {
        const read = readValues(parsed.values, loadedOptions);
        setValues(read.values);
        if (read.error) setNotice(read.error);
      };
      if (parsed.state && parsed.state !== store.getState().encoding.hash)
        void open(parsed.state, 'push').then((read) => read && take(read.options));
      else {
        take(store.getState().options);
        // Same definition: nothing reloads, so rewrite the link (an older form) here.
        setVisited((n) => n + 1);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo and redo, unless a text field has the keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || lastView.current !== 'edit') return;
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
      {view === 'view' && (
        <div className='flex flex-wrap items-center gap-2'>
          <ModeSwitch view={view} onChange={setView} />
          <span aria-hidden='true' className='mx-1 h-5 w-px bg-dg-border' />
          <button
            type='button'
            className={button}
            disabled={changed.length === 0}
            onClick={() => setValues({})}
            title='Back to the editor’s values'
          >
            ↺ reset values
          </button>
          <span className='text-xs text-dg-subtle'>
            {changed.length === 0 ? 'the editor’s values' : `${changed.length} changed · kept in the link`}
          </span>
          {stored.error && (
            <span className='text-xs text-amber-700' title={stored.error}>
              a value is out of range; the link keeps the last one that fit
            </span>
          )}
        </div>
      )}
      {view === 'view' && (
        <ViewerPanel
          definition={definition}
          changed={changed}
          onValue={(input, value) => setValues((current) => ({ ...current, [input.name]: { ...input, value } }))}
          onReset={(name) => setValues(({ [name]: _, ...rest }) => rest)}
        />
      )}
      {view === 'edit' && (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            <ModeSwitch view={view} onChange={setView} />
            <span aria-hidden='true' className='mx-1 h-5 w-px bg-dg-border' />
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
                  if (chosen)
                    store.getState().load({ definition: chosen.build(), options: {}, presets: {}, auto: true });
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
        </>
      )}
    </div>
  );
}

export default Playground;
