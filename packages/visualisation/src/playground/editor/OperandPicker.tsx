'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Expr } from '@dirty-geometry/vec2/recording/definition';
import { children, type ExprPath } from '@dirty-geometry/vec2/recording/expr';
import { operations, type Type } from '@dirty-geometry/vec2/schema/schema';
import { assignable, isNumeric, members, roleOf, typeName } from '@dirty-geometry/vec2/schema/typing';
import { DEFAULT_VALUES, defaultLiteral, literalShape } from '../defaults';
import { callFunction, changeOp, wrapMath } from '../model/ops';
import { OPERATION_GROUPS, operationLabel } from '../operations';
import { ValueEditor } from '../widgets';
import type { Editing } from './context';

type Tab = 'name' | 'value' | 'operation' | 'function' | 'math';
const TAB_LABELS: Record<Tab, string> = {
  name: 'Name',
  value: 'Value',
  operation: 'Operation',
  function: 'Function',
  math: 'Arithmetic',
};
const tabClass = (active: boolean) =>
  `rounded px-2 py-0.5 text-[11px] ${active ? 'bg-dg-navy-900 text-dg-sky-200' : 'text-dg-subtle hover:text-dg-steel-600'}`;
const choice =
  'block w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] hover:bg-dg-sky-100 focus:bg-dg-sky-100 focus:outline-none';
const action =
  'rounded border border-dg-border px-1.5 py-0.5 text-[11px] hover:border-dg-steel-600 hover:text-dg-steel-600';

const CURATED = OPERATION_GROUPS.flatMap((group) => group.ops.map((id) => ({ id, group: group.label })));
const isObj = (e: Expr | undefined): e is Exclude<Expr, null | string | number | boolean | Expr[]> =>
  e !== null && typeof e === 'object' && !Array.isArray(e);

/**
 * Pick what stands in a slot: a name in scope, a literal, an operation, a user function or arithmetic. Only what
 * fits the slot's type is offered; an operation keeps what it can of the current expression.
 */
export function OperandPicker({
  expr,
  slot,
  path,
  ed,
  optional,
  onClose,
}: {
  expr: Expr | undefined;
  slot: Type;
  path: ExprPath;
  ed: Editing;
  optional?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anything = slot === 'unknown';
  const numeric = anything || members(slot).some(isNumeric);
  const shape = useMemo(() => literalShape(slot), [slot]);
  const names = ed.scope.filter((b) => anything || assignable(b.type, slot));
  const fns = ed.fns.filter((fn) => {
    try {
      return anything || assignable(ed.typeOf({ call: fn.name, args: {} }), slot);
    } catch {
      return false;
    }
  });
  const tabs: Tab[] = [
    'name',
    'value',
    'operation',
    ...(fns.length ? (['function'] as const) : []),
    ...(numeric ? (['math'] as const) : []),
  ];
  const initial: Tab = isObj(expr) && ('op' in expr || 'call' in expr) ? 'operation' : names.length ? 'name' : 'value';
  const [tab, setTab] = useState<Tab>(initial);
  const [query, setQuery] = useState('');

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
  const fitting = useMemo(() => {
    const ok = operations.filter((op) => anything || assignable(op.returns, slot));
    const q = query.trim().toLowerCase();
    const matches = q ? ok.filter((op) => op.id.toLowerCase().includes(q)) : ok;
    const curated = CURATED.filter((c) => matches.some((op) => op.id === c.id));
    const rest = matches.filter((op) => !CURATED.some((c) => c.id === op.id));
    return { curated, rest: rest.slice(0, q ? 80 : 40), more: Math.max(0, rest.length - (q ? 80 : 40)) };
  }, [anything, slot, query]);
  /** Children that fit the slot: unwrapping keeps one of them. */
  const unwraps = isObj(expr)
    ? children(expr).filter((c) => {
        try {
          return !Array.isArray(c.expr) && (anything || assignable(ed.typeOf(c.expr), slot));
        } catch {
          return false;
        }
      })
    : [];

  return (
    <div
      ref={ref}
      role='dialog'
      aria-label={`pick ${ed.label} ${path.join('.') || 'expression'}`}
      className='absolute top-full left-0 z-30 mt-1 w-80 rounded-md border border-dg-border bg-white p-2 text-xs shadow-lg'
    >
      <div className='mb-1 flex items-center justify-between gap-1'>
        <span className='truncate font-mono text-[10px] text-dg-subtle' title={typeName(slot)}>
          {anything ? 'any value' : typeName(slot)}
        </span>
        <button type='button' aria-label='close' className='px-1 text-dg-subtle hover:text-dg-ink' onClick={onClose}>
          ✕
        </button>
      </div>
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
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className='max-h-72 overflow-y-auto'>
        {tab === 'name' &&
          (names.length ? (
            names.map((b) => (
              <button key={b.name} type='button' className={choice} onClick={() => put({ ref: b.name })}>
                {b.name} <span className='text-dg-subtle'>: {typeName(b.type)}</span>
              </button>
            ))
          ) : (
            <p className='text-dg-subtle'>Nothing defined before here has this type.</p>
          ))}

        {tab === 'value' && (
          <LiteralChoices expr={expr} slot={slot} shape={shape} put={put} set={(v) => ed.set(path, v)} />
        )}

        {tab === 'operation' && (
          <div>
            <input
              autoFocus
              aria-label='search operations'
              placeholder='search, e.g. Vec2.add'
              className='mb-1 w-full rounded border border-dg-border px-1.5 py-0.5 font-mono text-[11px]'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {fitting.curated.map(({ id, group }) => (
              <OperationChoice
                key={id}
                id={id}
                hint={group}
                onPick={() => put(changeOp(expr, id, ed.scope, ed.typeOf))}
              />
            ))}
            {fitting.curated.length > 0 && fitting.rest.length > 0 && <hr className='my-1 border-dg-border' />}
            {fitting.rest.map((op) => (
              <OperationChoice key={op.id} id={op.id} onPick={() => put(changeOp(expr, op.id, ed.scope, ed.typeOf))} />
            ))}
            {fitting.more > 0 && <p className='px-1.5 text-dg-subtle'>{fitting.more} more: search to narrow</p>}
          </div>
        )}

        {tab === 'function' &&
          fns.map((fn) => (
            <button
              key={fn.name}
              type='button'
              className={choice}
              onClick={() => put(callFunction(expr, fn, ed.scope, ed.typeOf))}
            >
              {fn.name}({fn.params.map((p) => `${p.name}: ${p.type}`).join(', ')})
            </button>
          ))}

        {tab === 'math' && (
          <div className='flex flex-wrap gap-1'>
            {(['+', '-', '*', '/', 'neg'] as const).map((op) => (
              <button
                key={op}
                type='button'
                className={action}
                onClick={() => put(wrapMath(expr ?? defaultLiteral(roleOf(slot) ?? 'Coordinate') ?? 0, op))}
              >
                {op === 'neg' ? '−x' : `x ${op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : op} …`}
              </button>
            ))}
          </div>
        )}
      </div>

      {(unwraps.length > 0 || ed.extract || optional) && (
        <div className='mt-2 flex flex-wrap gap-1 border-t border-dg-border pt-2'>
          {unwraps.map((c) => (
            <button key={c.path.join('.')} type='button' className={action} onClick={() => put(c.expr)}>
              keep {c.path.at(-1)}
            </button>
          ))}
          {ed.extract && path.length > 0 && expr !== undefined && (
            <button
              type='button'
              className={action}
              onClick={() => {
                ed.extract!(path);
                onClose();
              }}
            >
              to its own cell
            </button>
          )}
          {optional && expr !== undefined && (
            <button type='button' className={action} onClick={() => put(undefined)}>
              leave out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OperationChoice({ id, hint, onPick }: { id: string; hint?: string; onPick: () => void }) {
  const { head, owner } = operationLabel(id);
  return (
    <button type='button' className={choice} onClick={onPick} title={id}>
      {owner && <span className='text-dg-subtle'>{owner}</span>}
      {head}
      {hint && <span className='float-right text-[10px] text-dg-subtle'>{hint}</span>}
    </button>
  );
}

/** The literal forms the slot takes; a stored value is edited in place. */
function LiteralChoices({
  expr,
  slot,
  shape,
  put,
  set,
}: {
  expr: Expr | undefined;
  slot: Type;
  shape: ReturnType<typeof literalShape>;
  put: (e: Expr) => void;
  set: (e: Expr) => void;
}) {
  const anything = slot === 'unknown';
  const stored = isObj(expr) && 'value' in expr ? (expr.value as Record<string, unknown>) : undefined;
  const tags = anything ? Object.keys(DEFAULT_VALUES) : (shape.values ?? []);
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-1'>
        {(anything || shape.number) && (
          <button
            type='button'
            className={action}
            onClick={() => put(defaultLiteral(shape.number ?? 'Coordinate') ?? 0)}
          >
            number
          </button>
        )}
        {(anything || shape.number) && (
          <button type='button' className={action} onClick={() => put({ number: 'Infinity' })}>
            ∞
          </button>
        )}
        {(anything || shape.boolean) && (
          <>
            <button type='button' className={action} onClick={() => put(true)}>
              true
            </button>
            <button type='button' className={action} onClick={() => put(false)}>
              false
            </button>
          </>
        )}
        {shape.choices?.map((c) => (
          <button key={String(c)} type='button' className={action} onClick={() => put(c)}>
            {typeof c === 'string' ? `'${c}'` : String(c)}
          </button>
        ))}
        {(anything || shape.string) && (
          <button type='button' className={action} onClick={() => put('')}>
            text
          </button>
        )}
        {shape.null && (
          <button type='button' className={action} onClick={() => put(null)}>
            null
          </button>
        )}
        {(anything || shape.array) && (
          <button type='button' className={action} onClick={() => put([])}>
            [ list ]
          </button>
        )}
        {shape.object && (
          <button type='button' className={action} onClick={() => put({ object: {} })}>
            {'{ options }'}
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          <span className='text-[10px] text-dg-subtle'>stored value:</span>
          {tags.map((tag) => (
            <button key={tag} type='button' className={action} onClick={() => put({ value: DEFAULT_VALUES[tag] })}>
              {tag}
            </button>
          ))}
        </div>
      )}
      {stored && <ValueEditor label='stored value' value={stored} onChange={(json) => set({ value: json })} />}
    </div>
  );
}
