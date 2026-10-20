'use client';

/** The look of a toolbar tab, shared by the editor modes and the Edit | View switch. */
export const tab = (active: boolean) =>
  `border px-3 py-1 text-xs tracking-widest uppercase ${
    active
      ? 'border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200'
      : 'border-dg-border text-dg-subtle hover:border-dg-steel-600'
  }`;

/**
 * Edit | View: the playground and its viewer as two tabs of one page. The other page opens on the same definition
 * (`href` already carries its link); without an `href` the switch is left out.
 */
export function ModeSwitch({ page, href }: { page: 'edit' | 'view'; href?: string }) {
  if (href === undefined) return null;
  const item = (which: 'edit' | 'view', label: string, title: string) =>
    which === page ? (
      <span className={tab(true)} aria-current='page'>
        {label}
      </span>
    ) : (
      <a className={tab(false)} href={href} title={title}>
        {label}
      </a>
    );
  return (
    <nav className='flex' aria-label='Playground page'>
      {item('edit', 'Edit', 'Change the inputs, functions and cells')}
      {item('view', 'View', 'Play with the input values only')}
    </nav>
  );
}
