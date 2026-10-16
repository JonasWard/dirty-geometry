'use client';

import { useEffect, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { checkDefinition } from '@dirty-geometry/vec2/recording/replay';

const textarea =
  'h-[28rem] w-full rounded-md border border-dg-border bg-white p-2 font-mono text-[11px] leading-snug text-dg-ink focus:border-dg-steel-600 focus:outline-none';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';

/** Parse and check a definition typed as JSON. */
export function parseDefinitionJson(text: string): Definition {
  const parsed = JSON.parse(text) as Definition;
  if (parsed?.format !== 'vec2-definition') throw new Error('format must be "vec2-definition"');
  if (!Array.isArray(parsed.nodes) || typeof parsed.params !== 'object' || typeof parsed.outputs !== 'object') {
    throw new Error('a definition needs params, nodes and outputs');
  }
  const problems = checkDefinition(parsed);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return parsed;
}

/** The definition as editable JSON; applied with the button or Ctrl+Enter. */
export function JsonEditor({
  definition,
  onChange,
}: {
  definition: Definition;
  onChange: (definition: Definition) => void;
}) {
  const pretty = JSON.stringify(definition, null, 2);
  const [text, setText] = useState(pretty);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) setText(pretty);
  }, [pretty, dirty]);

  const apply = () => {
    try {
      onChange(parseDefinitionJson(text));
      setDirty(false);
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
        onChange={(event) => {
          setText(event.target.value);
          setDirty(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            apply();
          }
        }}
      />
      <div className='flex items-center gap-2 text-xs'>
        <button type='button' className={button} onClick={apply} disabled={!dirty}>
          Apply JSON
        </button>
        <button
          type='button'
          className={button}
          onClick={() => {
            setText(pretty);
            setDirty(false);
            setError(null);
          }}
          disabled={!dirty}
        >
          Revert
        </button>
        <span className='text-dg-subtle'>{dirty ? 'edited · Ctrl+Enter applies' : 'in sync'}</span>
      </div>
      {error && <pre className='whitespace-pre-wrap text-xs text-red-600'>{error}</pre>}
    </section>
  );
}
