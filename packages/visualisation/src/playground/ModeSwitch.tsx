'use client';

import type { View } from './url';

/** The look of a toolbar tab, shared by the editor modes and the Edit | View switch. */
export const tab = (active: boolean) =>
  `border px-3 py-1 text-xs tracking-widest uppercase ${
    active
      ? 'border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200'
      : 'border-dg-border text-dg-subtle hover:border-dg-steel-600'
  }`;

/** Edit | View: the editor, or only the inputs' values to play with. Both are views of one page and one link. */
export function ModeSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const item = (which: View, label: string, title: string) => (
    <button
      type='button'
      role='tab'
      aria-selected={view === which}
      className={tab(view === which)}
      title={title}
      onClick={() => onChange(which)}
    >
      {label}
    </button>
  );
  return (
    <div className='flex' role='tablist' aria-label='Playground view'>
      {item('edit', 'Edit', 'Change the inputs, functions and cells')}
      {item('view', 'View', 'Play with the input values only')}
    </div>
  );
}
