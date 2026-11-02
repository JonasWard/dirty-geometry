'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createDefinitionSchema,
  decodeDefinition,
  encodeDefinition,
} from '@dirty-geometry/vec2/schema/dense/definition';
import { VisualisationLegend } from '../core/VisualisationLegend';
import { CodeEditor } from './CodeEditor';
import { EncodingPanel } from './EncodingPanel';
import { JsonEditor } from './JsonEditor';
import { ModeSwitch, tab, type View } from './ModeSwitch';
import { CellsPanel, FunctionsPanel, InputsPanel, InputValueEditor } from './panels';
import { rangeOf } from './presets';
import * as ops from './model/ops';
import { PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { STARTERS } from './starters';
import { initialDocument } from './location';
import { toGraph } from './model/graph';
import { decodeLayout } from './model/layout';
import { NodeEditor } from './nodes/NodeEditor';
import { usePreview } from './nodes/preview';
import { createPlaygroundStore, StoreContext, useAnalysis, usePlayground, useStoreApi } from './store';
import { decodeAppState, encodeViewState, formatHash, parseHash } from './url';
import { changedInputs, readValues, ViewerPanel, type Values } from './Viewer';

type Mode = 'cells' | 'nodes' | 'code' | 'json';
/** The Raw editor's own modes (Nodes is a view of its own, beside Raw and View). */
const MODES: Record<Exclude<Mode, 'nodes'>, string> = { cells: 'Cells', code: 'Code', json: 'JSON' };
const button =
  'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 disabled:opacity-40';

/**
 * The vec2 playground: a definition is inputs, functions and cells, each cell one expression edited in place (or as
 * code, or as JSON). Every cell's geometry is drawn, and the whole definition lives in the link as a densing string.
 * Its View tab leaves only the inputs' values to change. The link is `#/<app>` for the editor and `#/<app>/<view>`
 * for the View tab: the app state is the definition (with the editor's values), the view state the input values.
 */
/** The playground's help: a title (the page's heading) and a short description. */
export type PlaygroundAbout = { title: ReactNode; body: ReactNode };

export function Playground({ about }: { about?: PlaygroundAbout } = {}) {
  const [initial] = useState(() => {
    const parsed = parseHash(typeof window === 'undefined' ? '' : window.location.hash);
    const { document, error } = initialDocument(parsed.app, parsed.layout);
    // A link that cannot be read opens the starter in the editor; its view part means nothing then.
    const read = error ? { values: {} } : readValues(parsed.view, document.options, document.definition.inputs);
    // An unreadable view part (from an older link) opens the editor, with the notice.
    const view: View = parsed.view && !error && !read.error ? 'view' : 'edit';
    return { store: createPlaygroundStore(document), view, values: read.values, error: error ?? read.error };
  });
  return (
    <StoreContext.Provider value={initial.store}>
      <PlaygroundView
        initialError={initial.error}
        initialView={initial.view}
        initialValues={initial.values}
        about={about}
      />
    </StoreContext.Provider>
  );
}

function PlaygroundView({
  initialError,
  initialView,
  initialValues,
  about,
}: {
  initialError?: string;
  initialView: View;
  initialValues: Values;
  about?: PlaygroundAbout;
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
  /** The Raw mode to come back to from Nodes. */
  const [raw, setRaw] = useState<Exclude<Mode, 'nodes'>>('cells');
  const switchTo = (next: View, nodes: boolean) => {
    setView(next);
    if (next === 'edit') setMode(nodes ? 'nodes' : raw);
  };
  const [view, setView] = useState<View>(initialView);
  const [values, setValues] = useState<Values>(initialValues);
  const [notice, setNotice] = useState<string | undefined>(initialError);
  const { analysis, evaluation } = useAnalysis(definition);
  const layout = usePlayground((s) => s.layout);
  const graph = useMemo(() => toGraph(definition), [definition]);
  // The node view's selection: any node; its value is drawn (a cell's own name selects the cell).
  const [nodeKey, setNodeKey] = useState<string | null>(null);
  const nodes = mode === 'nodes';
  // Below lg the node scene goes edge to edge and holds the drawing in a small window of its own.
  const narrow = useNarrow();
  const preview = usePreview(definition, evaluation, nodes ? nodeKey : null, graph);
  const drawing = (
    <PlaygroundCanvas
      definition={preview?.definition ?? definition}
      evaluation={preview?.evaluation ?? evaluation}
      selected={preview?.selected ?? selected}
    />
  );
  const schema = useMemo(() => createDefinitionSchema(options), [options]);
  // What this page last wrote to (or read from) the URL, and in which view.
  const lastHash = useRef(typeof window === 'undefined' ? '' : window.location.hash);
  const lastView = useRef(initialView);
  // Bumped when the URL was changed from outside, so it is rewritten as this page writes it.
  const [visited, setVisited] = useState(0);

  // The viewer's changed values, and the view state: every input's value (a value no range holds keeps the last link).
  const changed = useMemo(() => changedInputs(definition, values), [definition, values]);
  const stored = useMemo((): { text?: string; error?: string } => {
    if (view !== 'view') return {};
    const inputs = definition.inputs.map((input) => changed.find((c) => c.name === input.name) ?? input);
    try {
      return { text: encodeViewState(options, inputs) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [view, definition, changed, options]);
  const target = encoding.hash && !stored.error ? formatHash(encoding.hash, stored.text, encoding.layout) : undefined;

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
      let loadedOptions = store.getState().options;
      const current = store.getState().encoding;
      if (parsed.app && (parsed.app !== current.hash || parsed.layout !== current.layout)) {
        try {
          const read = decodeAppState(parsed.app);
          const layout = decodeLayout(parsed.layout, toGraph(read.definition));
          store.getState().load({ ...read, auto: false, layout }, 'push');
          loadedOptions = read.options;
          setNotice(undefined);
        } catch (error) {
          // Keep what is open; the next write puts its link back.
          setNotice(`Could not read the link: ${(error as Error).message}`);
          setVisited((n) => n + 1);
          return;
        }
      }
      const read = readValues(parsed.view, loadedOptions, store.getState().definition.inputs);
      const next: View = parsed.view && !read.error ? 'view' : 'edit';
      lastView.current = next;
      setView(next);
      setValues(read.values);
      if (read.error) setNotice(read.error);
      // Rewrite the link as this page writes it (when the load changed nothing, no edit does).
      setVisited((n) => n + 1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [store]);

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
    // On phones the page has no padding of its own: the View tab fills the screen, the Edit tab keeps some room.
    <div className={`space-y-3 ${view === 'edit' ? 'max-md:py-3' : ''}`}>
      {/* No help above the editor: the tool speaks for itself (the View tab's drawer keeps it on phones). */}
      {about && view === 'edit' && <div className='sr-only'>{about.title}</div>}
      {notice && (
        <div className='rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
          {notice}{' '}
          <button type='button' className='underline' onClick={() => setNotice(undefined)}>
            dismiss
          </button>
        </div>
      )}
      {view === 'view' && (
        <ViewerPanel
          definition={definition}
          options={options}
          presets={active}
          changed={changed}
          onValue={(input, value) => setValues((current) => ({ ...current, [input.name]: { ...input, value } }))}
          onReset={(name) => setValues(({ [name]: _, ...rest }) => rest)}
          onResetAll={() => setValues({})}
          linkError={stored.error}
          modeSwitch={<ModeSwitch view={view} nodes={mode === 'nodes'} onChange={switchTo} />}
        />
      )}
      {view === 'edit' && (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            <ModeSwitch view={view} nodes={mode === 'nodes'} onChange={switchTo} />
            <span aria-hidden='true' className='mx-1 h-5 w-px bg-dg-border' />
            {mode !== 'nodes' && (
              <div className='flex gap-1' role='tablist' aria-label='Raw mode'>
                {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
                  <button
                    key={m}
                    type='button'
                    role='tab'
                    aria-selected={mode === m}
                    className={tab(mode === m)}
                    onClick={() => {
                      setMode(m);
                      setRaw(m);
                    }}
                  >
                    {MODES[m]}
                  </button>
                ))}
              </div>
            )}
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
            <label className='ml-auto flex max-w-full min-w-0 items-center gap-1 text-xs text-dg-subtle'>
              start from
              <select
                aria-label='starter'
                className='min-w-0 max-w-full rounded border border-dg-border bg-white px-1.5 py-0.5 text-xs text-dg-ink'
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

          <div
            className={`grid ${nodes ? 'gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-0' : 'gap-4 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]'}`}
          >
            <div className='min-w-0 space-y-4'>
              {mode === 'cells' && (
                <>
                  <InputsPanel analysis={analysis} />
                  <FunctionsPanel analysis={analysis} />
                  <CellsPanel analysis={analysis} evaluation={evaluation} />
                </>
              )}
              {nodes && (
                <div className={narrow ? 'md:-mx-8' : ''}>
                  <NodeEditor
                    definition={definition}
                    graph={graph}
                    layout={layout ?? {}}
                    analysis={analysis}
                    evaluation={evaluation}
                    selected={nodeKey}
                    onSelect={setNodeKey}
                    {...(narrow && {
                      viewer: {
                        canvas: drawing,
                        inputs: (
                          <InputSliders
                            inputs={definition.inputs}
                            range={(type) => rangeOf(options, active, type)}
                            onChange={(name, value) =>
                              store.getState().commit(ops.setInput(store.getState().definition, name, { value }), {
                                coalesce: `input:${name}`,
                              })
                            }
                          />
                        ),
                      },
                    })}
                  />
                </div>
              )}
              {mode === 'code' && <CodeEditor definition={definition} onChange={commit} />}
              {mode === 'json' && <JsonEditor definition={definition} onChange={commit} />}
            </div>

            <div
              className={`min-w-0 space-y-4 ${nodes ? 'lg:sticky lg:top-12 lg:self-start' : 'xl:sticky xl:top-16 xl:self-start'}`}
            >
              {!(nodes && narrow) && (
                <div
                  className={
                    nodes
                      ? // Beside the node scene: as tall as it, square, no frame.
                        'relative isolate h-[calc(100dvh-5.75rem)] min-h-[360px] w-full overflow-hidden bg-[#0b0d12] md:h-[calc(100dvh-3rem)]'
                      : 'relative isolate h-[60vh] min-h-[420px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]'
                  }
                >
                  {drawing}
                  <VisualisationLegend
                    items={[
                      { color: PLAYGROUND_COLORS.intermediate, label: 'Cells', shape: 'line' },
                      { color: PLAYGROUND_COLORS.outputs[0], label: 'Outputs (one colour each)', shape: 'line' },
                      { color: PLAYGROUND_COLORS.selected, label: 'Selected (click a name)', shape: 'line' },
                    ]}
                  />
                </div>
              )}
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

/** Whether the screen is narrower than the two-column layout (below Tailwind's lg). */
function useNarrow() {
  const query = '(max-width: 1023.98px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return !!narrow;
}

/** The inputs' values as sliders (a range from the number types' packing ranges), for the full-screen drawing. */
function InputSliders({
  inputs,
  range,
  onChange,
}: {
  inputs: readonly import('@dirty-geometry/vec2/recording/definition').Input[];
  range: (type: string) => ReturnType<typeof rangeOf>;
  onChange: (name: string, value: import('@dirty-geometry/vec2/recording/definition').Input['value']) => void;
}) {
  if (!inputs.length) return <p className='text-dg-subtle'>No inputs to change.</p>;
  return (
    <div className='grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2'>
      {inputs.map((input) => (
        <label key={input.name} className='contents'>
          <span className='font-mono text-dg-ink'>{input.name}</span>
          <span className='min-w-0'>
            <InputValueEditor input={input} range={range} onChange={(value) => onChange(input.name, value)} />
          </span>
        </label>
      ))}
    </div>
  );
}
