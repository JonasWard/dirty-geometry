'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Definition, Expr, Input } from '@dirty-geometry/vec2/recording/definition';
import type { NumericOptions } from '@dirty-geometry/vec2/schema/dense/definition';
import { VisualisationLegend } from '../core/VisualisationLegend';
import { describeValue } from './describe';
import { drawableOutputs, isPlainType } from './draw';
import { currentHash, initialDocument } from './location';
import { ModeSwitch } from './ModeSwitch';
import { withInputValues } from './model/ops';
import { InputValueEditor } from './panels';
import { outputColor, PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { useAnalysis } from './store';
import {
  decodeViewerValues,
  encodePlaygroundHash,
  encodeViewerValues,
  isLegacyHash,
  readPlaygroundHash,
  splitViewerHash,
} from './url';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3 text-xs';
const heading = 'text-xs font-bold tracking-widest text-dg-subtle uppercase';
const button =
  'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 disabled:opacity-40';
const textButton =
  'text-[11px] text-dg-subtle hover:text-dg-steel-600 disabled:opacity-40 disabled:hover:text-dg-subtle';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Loaded = { definition: Definition; options: NumericOptions; link: string };
type Values = Record<string, Expr>;

/** The changed values of a viewer link that still fit the definition (same input, same type). */
function readValues(text: string | undefined, { definition, options }: Loaded): { values: Values; error?: string } {
  if (!text) return { values: {} };
  try {
    const stored = decodeViewerValues(text, options);
    const values: Values = {};
    for (const input of definition.inputs) {
      const value = stored[input.name];
      if (value && value.type === input.type && !same(value.value, input.value)) values[input.name] = value.value;
    }
    return { values };
  } catch (error) {
    return { values: {}, error: `The changed values in the link could not be read: ${(error as Error).message}` };
  }
}

/** The inputs whose value differs from the definition's, with that value. */
const changedInputs = (definition: Definition, values: Values): Input[] =>
  definition.inputs.flatMap((input) =>
    input.name in values && !same(values[input.name], input.value) ? [{ ...input, value: values[input.name]! }] : [],
  );

/**
 * A definition from a playground link, to play with: only the inputs' values change. The link keeps the
 * playground's values as the defaults and the changed ones after them, so a viewer link opens as it was left.
 * Outputs with geometry can be hidden, shown and hovered; plain values (numbers, flags, text) are listed.
 */
export function Viewer({ playgroundHref }: { playgroundHref?: string } = {}) {
  const [initial] = useState(() => {
    const { document, error } = initialDocument();
    const { link, values } = splitViewerHash(currentHash());
    const loaded = { definition: document.definition, options: document.options, link };
    const read = readValues(values, loaded);
    return { loaded, values: read.values, error: error ?? read.error };
  });
  const [loaded, setLoaded] = useState<Loaded>(initial.loaded);
  const [values, setValues] = useState<Values>(initial.values);
  const [notice, setNotice] = useState<string | undefined>(initial.error);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [intermediates, setIntermediates] = useState<boolean | undefined>(undefined);
  const lastHash = useRef<string>(currentHash());
  const { definition, options, link } = loaded;

  // Another definition: an older link (its decoder loads on demand and it is rewritten as a current one), or a
  // link pasted into this tab.
  const open = (hash: string) => {
    const split = splitViewerHash(hash);
    return readPlaygroundHash(split.link).then(
      (state) => {
        let next = split.link;
        if (state.upgraded)
          try {
            next = encodePlaygroundHash(state);
          } catch {
            // keep the old link; the playground upgrades it too
          }
        const fresh = { definition: state.definition, options: state.options, link: next };
        const read = readValues(split.values, fresh);
        setLoaded(fresh);
        setValues(read.values);
        setHidden(new Set());
        setIntermediates(undefined);
        setNotice(read.error);
      },
      (failure: Error) => setNotice(`Could not read the link: ${failure.message}`),
    );
  };
  useEffect(() => {
    if (isLegacyHash(link)) void open(currentHash());
    const onHashChange = () => {
      const next = currentHash();
      if (next && next !== lastHash.current) {
        lastHash.current = next;
        void open(next);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The link with the changed values; a value no range can hold keeps the last link that could be written.
  const changed = useMemo(() => changedInputs(definition, values), [definition, values]);
  const encoded = useMemo((): { hash?: string; error?: string } => {
    if (!changed.length || isLegacyHash(link)) return { hash: link };
    try {
      return { hash: `${link}/${encodeViewerValues(options, changed)}` };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [changed, link, options]);
  useEffect(() => {
    const { hash } = encoded;
    if (hash === undefined || hash === lastHash.current) return;
    const timer = setTimeout(() => {
      lastHash.current = hash;
      window.history.replaceState(null, '', `#/${hash}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [encoded]);

  const tweaked = useMemo(() => withInputValues(definition, values), [definition, values]);
  const { evaluation } = useAnalysis(tweaked);
  const drawable = drawableOutputs(definition);
  const plain = definition.cells.filter((cell) => cell.output && isPlainType(cell.type));
  // Without drawable outputs there is nothing else to draw, so the other cells are shown.
  const showIntermediates = intermediates ?? drawable.length === 0;
  const changedNames = new Set(changed.map((input) => input.name));
  // A hidden output shows while it is hovered.
  const drawnHidden = useMemo(
    () => (hovered && hidden.has(hovered) ? new Set([...hidden].filter((name) => name !== hovered)) : hidden),
    [hidden, hovered],
  );
  const toggle = (name: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  const result = (name: string) => {
    const cell = evaluation.cells.get(name);
    return cell && 'error' in cell ? { error: cell.error } : { text: describeValue(cell?.value) };
  };

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
        <ModeSwitch page='view' href={playgroundHref && `${playgroundHref}#/${link}`} />
        {playgroundHref !== undefined && <span aria-hidden='true' className='mx-1 h-5 w-px bg-dg-border' />}
        <button
          type='button'
          className={button}
          disabled={changed.length === 0}
          onClick={() => setValues({})}
          title="Back to the playground's values"
        >
          ↺ reset values
        </button>
        <span className='text-xs text-dg-subtle'>
          {changed.length === 0 ? 'the playground’s values' : `${changed.length} changed · kept in the link`}
        </span>
        {encoded.error && (
          <span className='text-xs text-amber-700' title={encoded.error}>
            a value is out of range; the link keeps the last one that fit
          </span>
        )}
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]'>
        <div className='min-w-0 space-y-4'>
          <section className={panel} aria-label='Inputs'>
            <h3 className={`${heading} mb-2`}>Inputs</h3>
            {definition.inputs.length === 0 && <p className='text-dg-subtle'>This definition has no inputs.</p>}
            <ul className='space-y-1.5'>
              {tweaked.inputs.map((input) => {
                const isChanged = changedNames.has(input.name);
                return (
                  <li key={input.name} className='flex flex-wrap items-center gap-2' title={input.type}>
                    <span className='min-w-16 font-mono font-semibold'>
                      {input.name}
                      {isChanged && <span className='text-dg-sky-600'> •</span>}
                    </span>
                    <InputValueEditor
                      input={input}
                      onChange={(value) => setValues((current) => ({ ...current, [input.name]: value }))}
                    />
                    {isChanged && (
                      <button
                        type='button'
                        className='px-1 text-dg-subtle hover:text-dg-steel-600'
                        aria-label={`reset ${input.name}`}
                        title="Back to the playground's value"
                        onClick={() => setValues(({ [input.name]: _, ...rest }) => rest)}
                      >
                        ↺
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={panel} aria-label='Outputs'>
            <div className='mb-1.5 flex items-center gap-3'>
              <h3 className={heading}>Outputs</h3>
              {drawable.length > 1 && (
                <>
                  <button
                    type='button'
                    className={`${textButton} ml-auto`}
                    disabled={hidden.size === 0}
                    onClick={() => setHidden(new Set())}
                  >
                    show all
                  </button>
                  <button
                    type='button'
                    className={textButton}
                    disabled={drawable.every((cell) => hidden.has(cell.name))}
                    onClick={() => setHidden(new Set(drawable.map((cell) => cell.name)))}
                  >
                    hide all
                  </button>
                </>
              )}
            </div>
            {drawable.length + plain.length === 0 && (
              <p className='text-dg-subtle'>This definition has no outputs; its cells are drawn instead.</p>
            )}
            <ul onMouseLeave={() => setHovered(null)}>
              {drawable.map((cell, i) => {
                const isHidden = hidden.has(cell.name);
                const r = result(cell.name);
                return (
                  <li
                    key={cell.name}
                    aria-label={`output ${cell.name}`}
                    title={cell.type}
                    className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                      hovered === cell.name ? 'bg-amber-100/80' : ''
                    } ${isHidden ? 'opacity-50' : ''}`}
                    onMouseEnter={() => setHovered(cell.name)}
                  >
                    <button
                      type='button'
                      role='switch'
                      aria-checked={!isHidden}
                      aria-label={`${isHidden ? 'show' : 'hide'} ${cell.name}`}
                      title={isHidden ? 'Show' : 'Hide'}
                      className='h-3 w-3 shrink-0 rounded-sm border-2'
                      style={{
                        borderColor: outputColor(i),
                        backgroundColor: isHidden ? 'transparent' : outputColor(i),
                      }}
                      onClick={() => toggle(cell.name)}
                    />
                    <span className='font-mono font-semibold'>{cell.name}</span>
                    <span
                      className={`ml-auto min-w-0 truncate font-mono text-[11px] ${
                        'error' in r ? 'text-red-600' : 'text-dg-subtle'
                      }`}
                      title={'error' in r ? r.error : r.text}
                    >
                      {'error' in r ? r.error : r.text}
                    </span>
                  </li>
                );
              })}
            </ul>
            {plain.length > 0 && (
              <dl
                aria-label='Values'
                className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-1 font-mono ${
                  drawable.length ? 'mt-1.5 border-t border-dg-border/60 pt-1.5' : ''
                }`}
              >
                {plain.map((cell) => {
                  const r = result(cell.name);
                  return (
                    <Fragment key={cell.name}>
                      <dt className='font-semibold' title={cell.type}>
                        {cell.name}
                      </dt>
                      <dd
                        className={`truncate text-right tabular-nums ${'error' in r ? 'text-red-600' : ''}`}
                        title={'error' in r ? r.error : r.text}
                      >
                        {'error' in r ? r.error : r.text}
                      </dd>
                    </Fragment>
                  );
                })}
              </dl>
            )}
            <label className='mt-2 flex items-center gap-1.5 text-[11px] text-dg-subtle'>
              <input
                type='checkbox'
                checked={showIntermediates}
                onChange={(event) => setIntermediates(event.target.checked)}
              />
              also draw the other cells and inputs
            </label>
          </section>
        </div>

        <div className='min-w-0 xl:sticky xl:top-20 xl:self-start'>
          <div className='relative h-[70vh] min-h-[420px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]'>
            <PlaygroundCanvas
              definition={tweaked}
              evaluation={evaluation}
              selected={hovered}
              hidden={drawnHidden}
              intermediates={showIntermediates}
              onHover={setHovered}
            />
            <VisualisationLegend
              items={[
                { color: PLAYGROUND_COLORS.outputs[0], label: 'Outputs (one colour each)', shape: 'line' },
                ...(showIntermediates
                  ? [{ color: PLAYGROUND_COLORS.intermediate, label: 'Other cells', shape: 'line' as const }]
                  : []),
                { color: PLAYGROUND_COLORS.selected, label: 'Hovered', shape: 'line' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Viewer;
