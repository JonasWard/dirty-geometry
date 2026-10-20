'use client';

import { useMemo, useRef, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { CodeError, parseDefinition } from './model/parse';
import { printDefinition } from './model/print';

const textarea =
  'h-[34rem] w-full rounded-md border border-dg-border bg-white p-2 font-mono text-[11px] leading-snug text-dg-ink focus:border-dg-steel-600 focus:outline-none';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';

/**
 * The definition as TypeScript: printed from the cells, edited as text, and read back on apply (Ctrl+Enter). While
 * the text is edited it is kept as typed; otherwise it follows every change made elsewhere.
 */
export function CodeEditor({ definition, onChange }: { definition: Definition; onChange: (d: Definition) => void }) {
  const printed = useMemo(() => printDefinition(definition), [definition]);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<CodeError | Error | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const text = draft ?? printed;

  const apply = () => {
    try {
      onChange(parseDefinition(text));
      setDraft(null);
      setError(null);
    } catch (failure) {
      setError(failure as Error);
      if (failure instanceof CodeError && area.current) {
        area.current.focus();
        area.current.setSelectionRange(failure.from, Math.max(failure.to, failure.from + 1));
      }
    }
  };

  return (
    <section className='space-y-1' aria-label='Code'>
      <textarea
        ref={area}
        aria-label='definition code'
        className={textarea}
        spellCheck={false}
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            apply();
          } else if (event.key === 'Tab') {
            event.preventDefault();
            const { selectionStart: start, selectionEnd: end } = event.currentTarget;
            setDraft(`${text.slice(0, start)}  ${text.slice(end)}`);
            requestAnimationFrame(() => area.current?.setSelectionRange(start + 2, start + 2));
          }
        }}
      />
      <div className='flex items-center gap-2 text-xs'>
        <button type='button' className={button} onClick={apply} disabled={draft === null}>
          Apply code
        </button>
        <button
          type='button'
          className={button}
          onClick={() => {
            setDraft(null);
            setError(null);
          }}
          disabled={draft === null}
        >
          Revert
        </button>
        <span className='text-dg-subtle'>{draft === null ? 'in sync' : 'edited · Ctrl+Enter applies'}</span>
      </div>
      {error && <pre className='whitespace-pre-wrap text-xs text-red-600'>{error.message}</pre>}
    </section>
  );
}
