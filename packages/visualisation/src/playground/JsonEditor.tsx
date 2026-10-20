'use client';

import { useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { fromV3 } from '@dirty-geometry/vec2/recording/migrate';
import type { DefinitionV3 } from '@dirty-geometry/vec2/recording/v3';

const textarea =
  'h-[34rem] w-full rounded-md border border-dg-border bg-white p-2 font-mono text-[11px] leading-snug text-dg-ink focus:border-dg-steel-600 focus:outline-none';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';

/** A definition typed as JSON; a version 3 definition (recorded nodes) is turned into cells. */
export function parseDefinitionJson(text: string): Definition {
  const parsed = JSON.parse(text) as Definition | DefinitionV3;
  if (parsed?.format !== 'vec2-definition') throw new Error('format must be "vec2-definition"');
  if (parsed.version === 3) return fromV3(parsed);
  if (parsed.version !== 4) throw new Error(`Unknown version ${String((parsed as { version?: unknown }).version)}`);
  if (![parsed.inputs, parsed.functions, parsed.cells].every(Array.isArray))
    throw new Error('a definition needs inputs, functions and cells (lists)');
  return parsed;
}

/** The definition as editable JSON; applied with the button or Ctrl+Enter. */
export function JsonEditor({ definition, onChange }: { definition: Definition; onChange: (d: Definition) => void }) {
  const pretty = JSON.stringify(definition, null, 2);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = draft ?? pretty;

  const apply = () => {
    try {
      onChange(parseDefinitionJson(text));
      setDraft(null);
      setError(null);
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <section className='space-y-1' aria-label='JSON definition'>
      <textarea
        aria-label='definition JSON'
        className={textarea}
        spellCheck={false}
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            apply();
          }
        }}
      />
      <div className='flex items-center gap-2 text-xs'>
        <button type='button' className={button} onClick={apply} disabled={draft === null}>
          Apply JSON
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
      {error && <pre className='whitespace-pre-wrap text-xs text-red-600'>{error}</pre>}
    </section>
  );
}
