'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Expr, MathOp } from '@dirty-geometry/vec2/recording/definition';
import type { ExprPath } from '@dirty-geometry/vec2/recording/expr';
import { operations, type Operation, type Type } from '@dirty-geometry/vec2/schema/schema';
import { assignable, isNumeric, members, roleOf, typeName } from '@dirty-geometry/vec2/schema/typing';
import { DEFAULT_VALUES, defaultLiteral, literalShape } from '../defaults';
import { callFunction, chain, changeOp, methodsOf, wrapMath } from '../model/ops';
import { operationLabel } from '../operations';
import { useFavourites } from '../store';
import { ValueEditor } from '../widgets';
import type { Editing } from './context';

type Tab = 'name' | 'value' | 'operation' | 'math';
const TABS: Record<Tab, string> = { name: 'Name', value: 'Value', operation: 'Operation', math: 'Arithmetic' };
const tabClass = (active: boolean) =>
  `rounded px-2 py-0.5 text-[11px] ${active ? 'bg-dg-navy-900 text-dg-sky-200' : 'text-dg-subtle hover:text-dg-steel-600'}`;
const choice =
  'block w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] hover:bg-dg-sky-100 focus:bg-dg-sky-100 focus:outline-none';
const action =
  'rounded border border-dg-border px-1.5 py-0.5 text-[11px] hover:border-dg-steel-600 hover:text-dg-steel-600';
/** Operations as the schema's folders: `geometry › regions › Polygon2 › fromCircle2`. */
type Folder = { folders: Map<string, Folder>; ops: Operation[]; count: number };
function treeOf(ops: Operation[]): Folder {
  const root: Folder = { folders: new Map(), ops: [], count: 0 };
  for (const op of ops) {
    let node = root;
    node.count++;
    for (const key of op.path.slice(0, -1)) {
      if (!node.folders.has(key)) node.folders.set(key, { folders: new Map(), ops: [], count: 0 });
      node = node.folders.get(key)!;
      node.count++;
    }
    node.ops.push(op);
  }
  return root;
}
function FolderView({
  folder,
  open,
  item,
}: {
  folder: Folder;
  open: boolean;
  item: (op: Operation) => React.ReactNode;
}) {
  return (
    <>
      {[...folder.folders].map(([name, sub]) => (
        <details key={name} open={open}>
          <summary className='cursor-pointer px-1 font-mono text-[11px] text-dg-subtle hover:text-dg-ink'>
            {name} <span className='text-[10px]'>{sub.count}</span>
          </summary>
          <div className='border-l border-dg-border pl-2'>
            <FolderView folder={sub} open={open} item={item} />
          </div>
        </details>
      ))}
      {folder.ops.map(item)}
    </>
  );
}
const isMath = (e: Expr | undefined): e is { math: MathOp; args: [Expr, Expr] } =>
  !!e && typeof e === 'object' && 'math' in e && e.math !== 'neg';

/**
 * Pick what stands in a slot (a name, a literal, an operation or user function, arithmetic), or with `chain` a method
 * to call on the value there. Only what fits the slot's type is offered.
 */
export function OperandPicker({
  expr,
  slot,
  path,
  ed,
  optional,
  chain: chaining,
  onClose,
}: {
  expr: Expr | undefined;
  slot: Type;
  path: ExprPath;
  ed: Editing;
  optional?: boolean;
  chain?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const any = slot === 'unknown';
  const fits = (type: Type) => any || assignable(type, slot);
  const names = ed.scope.filter((b) => fits(b.type));
  const numeric = any || members(slot).some(isNumeric);
  const tabs = (Object.keys(TABS) as Tab[]).filter((t) => t !== 'math' || numeric);
  const [tab, setTab] = useState<Tab>(
    expr !== null && typeof expr === 'object' && !Array.isArray(expr) && ('op' in expr || 'call' in expr)
      ? 'operation'
      : names.length
        ? 'name'
        : 'value',
  );
  const [query, setQuery] = useState('');
  const favourites = useFavourites();

  useEffect(() => {
    const outside = (event: MouseEvent) => ref.current && !ref.current.contains(event.target as Node) && onClose();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const put = (next: Expr | undefined) => {
    ed.set(path, next);
    onClose();
  };
  /** Operations (or, chaining, methods) matching the search: user functions, favourites, then the folders. */
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool =
      chaining && expr !== undefined ? methodsOf(ed.typeOf(expr)) : operations.filter((op) => fits(op.returns));
    const ops = pool.filter((op) => !q || op.id.toLowerCase().includes(q));
    const fns = chaining
      ? []
      : ed.fns.filter((fn) => (!q || fn.name.includes(q)) && fits(ed.typeOf({ call: fn.name })));
    return { fns, ops, tree: treeOf(ops) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, chaining, expr, slot, ed]);
  const item = (op: Operation) => {
    const { head, owner } = operationLabel(op.id);
    const starred = favourites.ids.includes(op.id);
    const pick = () => put(chaining ? chain(expr!, op.id, ed.scope) : changeOp(expr, op.id, ed.scope, ed.typeOf));
    return (
      <div key={op.id} className='flex items-center'>
        <button
          type='button'
          aria-label={`${starred ? 'unmark' : 'mark'} ${op.id} as favourite`}
          className={`px-0.5 text-[11px] ${starred ? 'text-amber-500' : 'text-dg-border hover:text-amber-500'}`}
          onClick={() => favourites.toggle(op.id)}
        >
          ★
        </button>
        <button type='button' className={choice} onClick={pick} title={op.id}>
          {owner && !chaining && <span className='text-dg-subtle'>{owner}</span>}
          {head}
        </button>
      </div>
    );
  };

  const operationList = (
    <div>
      <input
        autoFocus
        aria-label='search operations'
        placeholder={chaining ? 'search methods' : 'search, e.g. Vec2.add'}
        className='mb-1 w-full rounded border border-dg-border px-1.5 py-0.5 font-mono text-[11px]'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {listed.fns.map((fn) => (
        <button
          key={fn.name}
          type='button'
          className={choice}
          onClick={() => put(callFunction(expr, fn, ed.scope, ed.typeOf))}
        >
          {fn.name}({fn.params.map((p) => p.name).join(', ')})
        </button>
      ))}
      {listed.ops.filter((op) => favourites.ids.includes(op.id)).map(item)}
      {chaining ? (
        listed.ops.filter((op) => !favourites.ids.includes(op.id)).map(item)
      ) : (
        <div className='mt-1 border-t border-dg-border pt-1'>
          <FolderView folder={listed.tree} open={query.trim() !== ''} item={item} />
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={ref}
      role='dialog'
      aria-label={`${chaining ? 'chain on' : 'pick'} ${ed.label} ${path.join('.') || 'expression'}`}
      className='absolute top-full left-0 z-30 mt-1 w-80 rounded-md border border-dg-border bg-white p-2 text-xs shadow-lg'
    >
      <div className='mb-1 flex items-center justify-between gap-1'>
        <span className='truncate font-mono text-[10px] text-dg-subtle'>
          {chaining ? `methods of ${typeName(ed.typeOf(expr!))}` : any ? 'any value' : typeName(slot)}
        </span>
        <button type='button' aria-label='close' className='px-1 text-dg-subtle hover:text-dg-ink' onClick={onClose}>
          ✕
        </button>
      </div>
      {!chaining && (
        <div className='mb-2 flex flex-wrap gap-1' role='tablist'>
          {tabs.map((t) => (
            <button
              key={t}
              type='button'
              role='tab'
              aria-selected={tab === t}
              className={tabClass(tab === t)}
              onClick={() => setTab(t)}
            >
              {TABS[t]}
            </button>
          ))}
        </div>
      )}
      <div className='max-h-72 overflow-y-auto'>
        {chaining || tab === 'operation' ? (
          operationList
        ) : tab === 'name' ? (
          names.length ? (
            names.map((b) => (
              <button key={b.name} type='button' className={choice} onClick={() => put({ ref: b.name })}>
                {b.name} <span className='text-dg-subtle'>: {typeName(b.type)}</span>
              </button>
            ))
          ) : (
            <p className='text-dg-subtle'>Nothing defined before here has this type.</p>
          )
        ) : tab === 'value' ? (
          <Literals expr={expr} slot={slot} put={put} set={(v) => ed.set(path, v)} />
        ) : (
          <div className='flex flex-wrap gap-1'>
            {(['+', '-', '*', '/', 'neg'] as const).map((op) => (
              <button
                key={op}
                type='button'
                className={action}
                onClick={() =>
                  put(
                    isMath(expr) && op !== 'neg'
                      ? { ...expr, math: op }
                      : wrapMath(expr ?? defaultLiteral(roleOf(slot) ?? 'Coordinate') ?? 0, op),
                  )
                }
              >
                {op === 'neg' ? '−x' : `x ${{ '+': '+', '-': '−', '*': '×', '/': '÷' }[op]} y`}
              </button>
            ))}
          </div>
        )}
      </div>
      {optional && expr !== undefined && !chaining && (
        <button type='button' className={`${action} mt-2`} onClick={() => put(undefined)}>
          leave out
        </button>
      )}
    </div>
  );
}

/** The literal forms the slot takes, in one row; a stored value is edited in place. */
function Literals({
  expr,
  slot,
  put,
  set,
}: {
  expr: Expr | undefined;
  slot: Type;
  put: (e: Expr) => void;
  set: (e: Expr) => void;
}) {
  const any = slot === 'unknown';
  const shape = literalShape(slot);
  const stored =
    expr && typeof expr === 'object' && 'value' in expr ? (expr.value as Record<string, unknown>) : undefined;
  const when = (ok: unknown, ...pairs: [string, Expr][]) => (ok ? pairs : []);
  const options: [string, Expr][] = [
    ...when(
      any || shape.number,
      ['number', defaultLiteral(shape.number ?? 'Coordinate') ?? 0],
      ['∞', { number: 'Infinity' }],
    ),
    ...when(any || shape.boolean, ['true', true], ['false', false]),
    ...(shape.choices ?? []).map((c): [string, Expr] => [typeof c === 'string' ? `'${c}'` : String(c), c]),
    ...when(any || shape.string, ['text', '']),
    ...when(shape.null, ['null', null]),
    ...when(any || shape.array, ['[ list ]', []]),
    ...when(shape.object, ['{ options }', { object: {} }]),
    ...(any ? Object.keys(DEFAULT_VALUES) : (shape.values ?? [])).map((tag): [string, Expr] => [
      tag,
      { value: DEFAULT_VALUES[tag] },
    ]),
  ];
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-1'>
        {options.map(([label, value]) => (
          <button key={label} type='button' className={action} onClick={() => put(value)}>
            {label}
          </button>
        ))}
      </div>
      {stored && <ValueEditor label='stored value' value={stored} onChange={(json) => set({ value: json })} />}
    </div>
  );
}
