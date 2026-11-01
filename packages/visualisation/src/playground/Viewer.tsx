'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { Definition, Input } from '@dirty-geometry/vec2/recording/definition';
import type { ActivePresets, NumericOptions } from '@dirty-geometry/vec2/schema/dense/definition';
import { describeValue } from './describe';
import { drawableOutputs, isPlainType } from './draw';
import { withInputValues } from './model/ops';
import { InputValueEditor } from './panels';
import { outputColor, PlaygroundCanvas } from './PlaygroundCanvas';
import { rangeOf } from './presets';
import { useAnalysis } from './store';
import { decodeViewState } from './url';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3 text-xs';
const heading = 'text-xs font-bold tracking-widest text-dg-subtle uppercase';
const textButton =
  'text-[11px] text-dg-subtle hover:text-dg-steel-600 disabled:opacity-40 disabled:hover:text-dg-subtle';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The viewer's values by input name; one counts while the definition has that input with the same type. */
export type Values = Record<string, Input>;

/** The values stored in a link (its last part, read against the definition's `inputs`), or none when they cannot be read. */
export function readValues(
  text: string | undefined,
  options: NumericOptions,
  inputs: readonly Input[],
): { values: Values; error?: string } {
  if (!text) return { values: {} };
  try {
    return { values: decodeViewState(text, options, inputs) };
  } catch {
    // An older link, or one cut short: the definition still opens, with its own values.
    return {
      values: {},
      error:
        "The input values in this link could not be read (it may be from an older version), so the editor's values are shown.",
    };
  }
}

/** The definition's inputs whose viewer value differs from their own, with that value. */
export const changedInputs = (definition: Definition, values: Values): Input[] =>
  definition.inputs.flatMap((input) => {
    const value = values[input.name];
    return value && value.type === input.type && !same(value.value, input.value)
      ? [{ ...input, value: value.value }]
      : [];
  });

/**
 * The viewer: a definition with only its inputs' values to change (`changed`, the rest keep the definition's), its
 * outputs drawn. Outputs with geometry can be hidden, shown and hovered; plain values (numbers, flags, text) are
 * listed.
 */
export function ViewerPanel({
  definition,
  options,
  presets,
  changed,
  onValue,
  onReset,
  onResetAll,
  linkError,
  modeSwitch,
  about,
}: {
  definition: Definition;
  /** The number ranges the definition is packed with: a slider spans its type's. */
  options: NumericOptions;
  presets: ActivePresets;
  changed: readonly Input[];
  onValue: (input: Input, value: Input['value']) => void;
  onReset: (name: string) => void;
  /** Every input back to the editor's value. */
  onResetAll: () => void;
  /** Why the latest values could not be written to the link (the link keeps the last ones that fit). */
  linkError?: string;
  /** The Edit | View switch, drawn on the drawing's top left. */
  modeSwitch?: ReactNode;
  /** The playground's help, shown at the top of the drawer on phones (elsewhere it is above the toolbar). */
  about?: { title: ReactNode; body: ReactNode };
}) {
  // Phones: the panels are a drawer over the drawing, closed to its handle at first.
  const [drawer, setDrawer] = useState(false);
  // Sliders (with the exact value beside each) or number boxes only; this page's choice, not the link's.
  const [sliders, setSliders] = useState(true);
  const range = useMemo(
    () => (sliders ? (type: string) => rangeOf(options, presets, type) : undefined),
    [sliders, options, presets],
  );
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [intermediates, setIntermediates] = useState<boolean | undefined>(undefined);

  const tweaked = useMemo(
    () => withInputValues(definition, Object.fromEntries(changed.map((input) => [input.name, input.value]))),
    [definition, changed],
  );
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
    <div className='relative grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]'>
      {/* The panels: a column from md up; below it, a drawer over the bottom of the drawing. */}
      <aside
        aria-label='Inputs and outputs'
        className='min-w-0 max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:flex max-md:max-h-[50%] max-md:flex-col max-md:rounded-t-lg max-md:border max-md:border-dg-border max-md:bg-dg-canvas/95 max-md:shadow-[0_-6px_20px_rgba(0,0,0,0.3)] max-md:backdrop-blur-sm'
      >
        <button
          type='button'
          aria-expanded={drawer}
          className='flex w-full shrink-0 items-center gap-2 px-3 py-2 text-xs md:hidden'
          onClick={() => setDrawer((open) => !open)}
        >
          <span className='font-bold tracking-widest text-dg-subtle uppercase'>Inputs &amp; outputs</span>
          {changed.length > 0 && <span className='text-dg-subtle'>· {changed.length} changed</span>}
          <span aria-hidden='true' className='ml-auto text-dg-subtle'>
            {drawer ? '▾' : '▴'}
          </span>
        </button>
        <div
          className={`min-w-0 space-y-4 ${
            drawer ? 'max-md:min-h-0 max-md:overflow-y-auto max-md:px-2 max-md:pb-2' : 'max-md:hidden'
          }`}
        >
          {about && (
            <section className='rounded-md border border-dg-sky-400/70 bg-dg-sky-200/25 p-3 text-sm md:hidden'>
              <div className='mb-1 [&_h1]:text-sm'>{about.title}</div>
              <div className='leading-relaxed text-dg-muted'>{about.body}</div>
            </section>
          )}
          <section className={panel} aria-label='Inputs'>
            <div className='mb-2 flex items-center gap-3'>
              <h3 className={heading}>Inputs</h3>
              <button
                type='button'
                className={textButton}
                disabled={changed.length === 0}
                onClick={onResetAll}
                title={
                  changed.length === 0
                    ? 'The editor’s values'
                    : `${changed.length} changed (kept in the link): back to the editor’s values`
                }
              >
                ↺ reset values
              </button>
              <div className='ml-auto flex gap-2' role='group' aria-label='Number inputs as'>
                {(
                  [
                    [true, 'sliders'],
                    [false, 'numbers'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type='button'
                    aria-pressed={sliders === value}
                    className={`${textButton} ${sliders === value ? 'font-semibold text-dg-navy-900' : ''}`}
                    onClick={() => setSliders(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {linkError && (
              <p className='mb-2 text-[11px] text-amber-700' title={linkError}>
                A value is out of range; the link keeps the last one that fit.
              </p>
            )}
            {definition.inputs.length === 0 && <p className='text-dg-subtle'>This definition has no inputs.</p>}
            {/* Name | value | reset, as columns, so the sliders line up. */}
            <ul className='grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5'>
              {tweaked.inputs.map((input) => {
                const isChanged = changedNames.has(input.name);
                return (
                  <li key={input.name} className='contents'>
                    <span className='font-mono font-semibold' title={input.type}>
                      {input.name}
                    </span>
                    <span className='flex min-w-0 items-center'>
                      <InputValueEditor input={input} range={range} onChange={(value) => onValue(input, value)} />
                    </span>
                    {/* Always in place (hidden when unchanged), so a slider does not shift when it appears. */}
                    <button
                      type='button'
                      className={`px-1 text-dg-subtle hover:text-dg-steel-600 ${isChanged ? '' : 'invisible'}`}
                      aria-label={`reset ${input.name}`}
                      aria-hidden={!isChanged}
                      tabIndex={isChanged ? undefined : -1}
                      title='Back to the editor’s value'
                      onClick={() => onReset(input.name)}
                    >
                      ↺
                    </button>
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
      </aside>

      <div className='min-w-0 xl:sticky xl:top-16 xl:self-start'>
        {/* Phones: the screen height left under the header; edge to edge. */}
        <div className='relative h-[calc(100dvh-8.5rem)] min-h-[320px] w-full overflow-hidden border border-dg-border bg-[#0b0d12] max-md:border-x-0 md:h-[70vh] md:min-h-[420px]'>
          {modeSwitch && (
            <div className='absolute left-2 top-2 z-10 rounded bg-dg-canvas/90 shadow ring-1 ring-white/40'>
              {modeSwitch}
            </div>
          )}
          {/* The drawing's own stacking context keeps its labels under the switch and the drawer. */}
          <div className='absolute inset-0 isolate'>
            <PlaygroundCanvas
              definition={tweaked}
              evaluation={evaluation}
              selected={hovered}
              hidden={drawnHidden}
              intermediates={showIntermediates}
              onHover={setHovered}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
