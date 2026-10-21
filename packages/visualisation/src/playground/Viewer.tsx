'use client';

import { Fragment, useMemo, useState } from 'react';
import type { Definition, Input } from '@dirty-geometry/vec2/recording/definition';
import type { NumericOptions } from '@dirty-geometry/vec2/schema/dense/definition';
import { VisualisationLegend } from '../core/VisualisationLegend';
import { describeValue } from './describe';
import { drawableOutputs, isPlainType } from './draw';
import { withInputValues } from './model/ops';
import { InputValueEditor } from './panels';
import { outputColor, PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { useAnalysis } from './store';
import { decodeViewState } from './url';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3 text-xs';
const heading = 'text-xs font-bold tracking-widest text-dg-subtle uppercase';
const textButton =
  'text-[11px] text-dg-subtle hover:text-dg-steel-600 disabled:opacity-40 disabled:hover:text-dg-subtle';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The viewer's values by input name; one counts while the definition has that input with the same type. */
export type Values = Record<string, Input>;

/** The values stored in a link (its last part in the viewer), or none when they cannot be read. */
export function readValues(text: string | undefined, options: NumericOptions): { values: Values; error?: string } {
  if (!text) return { values: {} };
  try {
    return { values: decodeViewState(text, options) };
  } catch (error) {
    return { values: {}, error: `The input values in the link could not be read: ${(error as Error).message}` };
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
  changed,
  onValue,
  onReset,
}: {
  definition: Definition;
  changed: readonly Input[];
  onValue: (input: Input, value: Input['value']) => void;
  onReset: (name: string) => void;
}) {
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
                  <InputValueEditor input={input} onChange={(value) => onValue(input, value)} />
                  {isChanged && (
                    <button
                      type='button'
                      className='px-1 text-dg-subtle hover:text-dg-steel-600'
                      aria-label={`reset ${input.name}`}
                      title='Back to the editor’s value'
                      onClick={() => onReset(input.name)}
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

      <div className='min-w-0 xl:sticky xl:top-16 xl:self-start'>
        <div className='relative isolate h-[70vh] min-h-[420px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]'>
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
  );
}
