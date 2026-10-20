'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Expr, Input } from '@dirty-geometry/vec2/recording/definition';
import { VisualisationLegend } from '../core/VisualisationLegend';
import { describeValue } from './describe';
import { currentHash, initialDocument } from './location';
import { withInputValues } from './model/ops';
import { InputValueEditor } from './panels';
import { outputColor, PLAYGROUND_COLORS, PlaygroundCanvas } from './PlaygroundCanvas';
import { useAnalysis } from './store';
import { isLegacyHash, readPlaygroundHash } from './url';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3 text-xs';
const heading = 'text-xs font-bold tracking-widest text-dg-subtle uppercase';
const button =
  'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 disabled:opacity-40';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A definition from a playground link, to play with: only the inputs' values change (the link's values are the
 * defaults and the link is left as it is), and the outputs can be hidden, shown and hovered.
 */
export function Viewer({ playgroundHref }: { playgroundHref?: string } = {}) {
  const [initial] = useState(initialDocument);
  const [definition, setDefinition] = useState(initial.document.definition);
  const [hash, setHash] = useState(currentHash);
  const [notice, setNotice] = useState<string | undefined>(initial.error);
  const [values, setValues] = useState<Record<string, Expr>>({});
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [intermediates, setIntermediates] = useState<boolean | undefined>(undefined);

  // Another definition: an older link (its decoder loads on demand) or a link pasted into this tab.
  const open = (next: string) =>
    readPlaygroundHash(next).then(
      (state) => {
        setDefinition(state.definition);
        setHash(next);
        setValues({});
        setHidden(new Set());
        setIntermediates(undefined);
        setNotice(undefined);
      },
      (failure: Error) => setNotice(`Could not read the link: ${failure.message}`),
    );
  useEffect(() => {
    const now = currentHash();
    if (now && isLegacyHash(now)) void open(now);
    const onHashChange = () => {
      const next = currentHash();
      if (next) void open(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const tweaked = useMemo(() => withInputValues(definition, values), [definition, values]);
  const { evaluation } = useAnalysis(tweaked);
  const outputs = definition.cells.filter((cell) => cell.output);
  // Without outputs there is nothing else to draw, so the other cells are shown.
  const showIntermediates = intermediates ?? outputs.length === 0;
  const changed = (input: Input) => input.name in values && !same(values[input.name], input.value);
  const anyChanged = definition.inputs.some(changed);
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
      <div className='grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]'>
        <div className='min-w-0 space-y-4'>
          <section className={panel} aria-label='Inputs'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <h3 className={heading}>Inputs</h3>
              <button type='button' className={button} disabled={!anyChanged} onClick={() => setValues({})}>
                reset to defaults
              </button>
            </div>
            {definition.inputs.length === 0 && <p className='text-dg-subtle'>This definition has no inputs.</p>}
            <ul className='space-y-1.5'>
              {tweaked.inputs.map((input, i) => {
                const original = definition.inputs[i]!;
                const isChanged = changed(original);
                return (
                  <li key={input.name} className='flex flex-wrap items-center gap-2'>
                    <span className='min-w-16 font-mono font-semibold'>
                      {input.name}
                      {isChanged && (
                        <span className='text-dg-sky-600' title='Changed from the default'>
                          {' '}
                          •
                        </span>
                      )}
                    </span>
                    <span className='text-dg-subtle'>{input.type}</span>
                    <InputValueEditor
                      input={input}
                      onChange={(value) => setValues((current) => ({ ...current, [input.name]: value }))}
                    />
                    {isChanged && (
                      <button
                        type='button'
                        className='px-1 text-dg-subtle hover:text-dg-steel-600'
                        aria-label={`reset ${input.name}`}
                        title='Back to the default'
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
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <h3 className={heading}>Outputs</h3>
              <button
                type='button'
                className={`${button} ml-auto`}
                disabled={hidden.size === 0}
                onClick={() => setHidden(new Set())}
              >
                show all
              </button>
              <button
                type='button'
                className={button}
                disabled={outputs.length === 0 || outputs.every((cell) => hidden.has(cell.name))}
                onClick={() => setHidden(new Set(outputs.map((cell) => cell.name)))}
              >
                hide all
              </button>
            </div>
            {outputs.length === 0 && (
              <p className='text-dg-subtle'>This definition has no outputs; its cells are drawn instead.</p>
            )}
            <ul className='space-y-1' onMouseLeave={() => setHovered(null)}>
              {outputs.map((cell, i) => {
                const result = evaluation.cells.get(cell.name);
                const isHidden = hidden.has(cell.name);
                return (
                  <li
                    key={cell.name}
                    aria-label={`output ${cell.name}`}
                    className={`flex items-start gap-2 rounded border px-2 py-1 ${
                      hovered === cell.name ? 'border-amber-300 bg-amber-50/70' : 'border-dg-border/60 bg-white/70'
                    } ${isHidden ? 'opacity-50' : ''}`}
                    onMouseEnter={() => setHovered(cell.name)}
                  >
                    <button
                      type='button'
                      role='switch'
                      aria-checked={!isHidden}
                      aria-label={`${isHidden ? 'show' : 'hide'} ${cell.name}`}
                      title={isHidden ? 'Show' : 'Hide'}
                      className='mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border'
                      style={{
                        borderColor: outputColor(i),
                        backgroundColor: isHidden ? 'transparent' : outputColor(i),
                      }}
                      onClick={() => toggle(cell.name)}
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='font-mono font-semibold'>{cell.name}</span>{' '}
                      <span className='text-dg-subtle'>{cell.type}</span>
                      <span
                        className={`block truncate font-mono text-[11px] ${
                          result && 'error' in result ? 'text-red-600' : 'text-dg-subtle'
                        }`}
                        title={result && 'error' in result ? result.error : describeValue(result?.value)}
                      >
                        {result && 'error' in result ? result.error : `→ ${describeValue(result?.value)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <label className='mt-2 flex items-center gap-1.5 text-dg-subtle'>
              <input
                type='checkbox'
                checked={showIntermediates}
                onChange={(event) => setIntermediates(event.target.checked)}
              />
              also draw the other cells and inputs
            </label>
          </section>

          {playgroundHref && (
            <a className={button} href={hash ? `${playgroundHref}#/${hash}` : playgroundHref}>
              ← edit in the playground
            </a>
          )}
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
