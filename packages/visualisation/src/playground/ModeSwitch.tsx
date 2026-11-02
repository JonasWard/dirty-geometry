'use client';

/** The editor, or the View tab with only the input values to change. */
export type View = 'edit' | 'view';

/** The look of a toolbar tab, shared by the editor modes and the Edit | View switch. */
export const tab = (active: boolean) =>
  `border px-3 py-1 text-xs tracking-widest uppercase ${
    active
      ? 'border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200'
      : 'border-dg-border text-dg-subtle hover:border-dg-steel-600'
  }`;

/**
 * Raw | Nodes | View: the definition as cells, code or JSON (Raw); as a node graph (Nodes); or only the inputs' values
 * to play with (View). All are views of one page and one link.
 */
export function ModeSwitch({
  view,
  nodes,
  onChange,
}: {
  view: View;
  /** Whether the editor shows the node graph. */
  nodes: boolean;
  onChange: (view: View, nodes: boolean) => void;
}) {
  const item = (label: string, title: string, active: boolean, next: View, toNodes: boolean) => (
    <button
      type='button'
      role='tab'
      aria-selected={active}
      className={tab(active)}
      title={title}
      onClick={() => onChange(next, toNodes)}
    >
      {label}
    </button>
  );
  return (
    <div className='flex' role='tablist' aria-label='Playground view'>
      {item('Raw', 'The inputs, functions and cells, as cells, code or JSON', view === 'edit' && !nodes, 'edit', false)}
      {item('Nodes', 'The definition as a node graph', view === 'edit' && nodes, 'edit', true)}
      {item('View', 'Play with the input values only', view === 'view', 'view', nodes)}
    </div>
  );
}
