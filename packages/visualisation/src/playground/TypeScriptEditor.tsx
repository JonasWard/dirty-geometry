'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { definitionToTypeScript } from '@dirty-geometry/vec2-dense/codegen';
import { runTypeScript } from '@dirty-geometry/vec2-dense/run';

const textarea =
  'h-80 w-full rounded-md border border-dg-border bg-[#0b0d12] p-2 font-mono text-[11px] leading-snug text-[#d7dde8] focus:border-dg-steel-600 focus:outline-none';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';

/**
 * The definition as recorder TypeScript. Edits run through the recorder (in this browser, only when you
 * apply them) and replace the definition.
 */
export function TypeScriptEditor({
  definition,
  onChange,
}: {
  definition: Definition;
  onChange: (definition: Definition) => void;
}) {
  const generated = useMemo(() => definitionToTypeScript(definition), [definition]);
  const [text, setText] = useState(generated);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ error?: string; warnings?: readonly string[]; running?: boolean }>({});
  useEffect(() => {
    if (!dirty) setText(generated);
  }, [generated, dirty]);

  const apply = async () => {
    setStatus({ running: true });
    try {
      const result = await runTypeScript(text);
      onChange(result.definition);
      setDirty(false);
      setStatus({ warnings: result.warnings });
    } catch (failure) {
      setStatus({ error: (failure as Error).message });
    }
  };

  return (
    <section className='space-y-1' aria-label='TypeScript'>
      <div className='flex items-center justify-between'>
        <h3 className='text-xs font-bold tracking-widest text-dg-subtle uppercase'>TypeScript</h3>
        <span className='text-xs text-dg-subtle'>
          {dirty ? 'edited · Ctrl+Enter applies' : 'generated from the definition'}
        </span>
      </div>
      <textarea
        aria-label='definition TypeScript'
        className={textarea}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setDirty(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void apply();
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            const target = event.currentTarget;
            const { selectionStart, selectionEnd } = target;
            setText(`${text.slice(0, selectionStart)}  ${text.slice(selectionEnd)}`);
            setDirty(true);
            requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
          }
        }}
      />
      <div className='flex items-center gap-2 text-xs'>
        <button type='button' className={button} onClick={() => void apply()} disabled={!dirty || status.running}>
          {status.running ? 'Running…' : 'Apply TypeScript'}
        </button>
        <button
          type='button'
          className={button}
          disabled={!dirty}
          onClick={() => {
            setText(generated);
            setDirty(false);
            setStatus({});
          }}
        >
          Revert
        </button>
      </div>
      {status.error && <pre className='whitespace-pre-wrap text-xs text-red-600'>{status.error}</pre>}
      {status.warnings?.map((warning) => (
        <div key={warning} className='text-xs text-amber-700'>
          {warning}
        </div>
      ))}
    </section>
  );
}
