'use client';

import { useCallback, useState } from 'react';
import type { Expr, MathOp } from '@dirty-geometry/vec2/recording/definition';
import type { ExprPath } from '@dirty-geometry/vec2/recording/expr';
import { isOptional, isRest, operationById, slotType, type Slot, type Type } from '@dirty-geometry/vec2/schema/schema';
import { members, parseTypeName, roleOf } from '@dirty-geometry/vec2/schema/typing';
import { literalShape } from '../defaults';
import { describeJson } from '../describe';
import { operationLabel } from '../operations';
import { NumberInput } from '../widgets';
import { pathKey, type Editing } from './context';
import { OperandPicker } from './OperandPicker';

type Obj = Exclude<Expr, null | string | number | boolean | Expr[]>;
const isObj = (e: Expr | undefined): e is Obj => e !== null && typeof e === 'object' && !Array.isArray(e);
const token =
  'rounded border px-1 py-px font-mono text-[11px] leading-4 hover:border-dg-steel-600 focus:outline-none focus:ring-1 focus:ring-dg-steel-600';
const tokenKinds = {
  ref: 'border-sky-300 bg-sky-50 text-sky-800',
  op: 'border-dg-border bg-white text-dg-ink font-semibold',
  literal: 'border-dg-border bg-white text-dg-ink',
  missing: 'border-red-300 border-dashed bg-red-50 text-red-700',
  ghost: 'border-dashed border-dg-border text-dg-subtle',
};
const punct = 'font-mono text-[11px] text-dg-subtle';
const MATH_LABEL: Record<MathOp, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/** The item type of a list slot. */
const itemOf = (slot: Type): Type => {
  const list = members(slot).find((m) => Array.isArray(m)) as Type[] | undefined;
  if (list) return list[0]!;
  const tuple = members(slot).find((m) => m && typeof m === 'object' && 'tuple' in (m as object)) as
    | { tuple: Type[] }
    | undefined;
  return tuple ? (tuple.tuple.length === 1 ? tuple.tuple[0]! : { or: tuple.tuple }) : 'unknown';
};
/** The fields of an options slot (`{ slack?: Epsilon, mesh?: boolean }`). */
const fieldsOf = (slot: Type): Record<string, Slot> => literalShape(slot).object ?? {};
/** An expression big enough that its arguments go on lines of their own. */
const isLarge = (e: Expr | undefined): boolean =>
  Array.isArray(e)
    ? e.some((item) => isObj(item) || Array.isArray(item)) && e.length > 1
    : isObj(e) && ('op' in e || 'call' in e) && Object.keys(e.args ?? {}).length > 0;

/**
 * One slot of an expression: what stands there, and a picker to change it. Slots nest: an operation shows its
 * arguments as slots, so the whole expression is edited in place.
 */
export function Operand({
  expr,
  slot,
  path,
  ed,
  name,
  optional,
}: {
  expr: Expr | undefined;
  slot: Type;
  path: ExprPath;
  ed: Editing;
  /** The parameter or field this slot is. */
  name?: string;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const issues = ed.issues.get(pathKey(path));
  const label = `${ed.label} ${path.join('.') || 'expression'}`;
  const opener = (kind: keyof typeof tokenKinds, text: React.ReactNode, title?: string) => (
    <button
      type='button'
      aria-label={label}
      aria-expanded={open}
      title={issues?.join('\n') ?? title}
      className={`${token} ${issues ? tokenKinds.missing : tokenKinds[kind]}`}
      onClick={() => setOpen((o) => !o)}
    >
      {text}
    </button>
  );

  let body: React.ReactNode;
  if (expr === undefined)
    body = opener(optional ? 'ghost' : 'missing', optional ? `+ ${name ?? ''}` : `${name ?? '?'}?`);
  else if (typeof expr === 'number')
    body = (
      <span className='inline-flex items-center'>
        <NumberInput
          label={label}
          value={expr}
          onChange={(v) => ed.set(path, v, { coalesce: `${ed.label}:${pathKey(path)}` })}
          narrow
        />
        {opener('literal', '▾', 'change')}
      </span>
    );
  else if (typeof expr === 'boolean') {
    const choices = literalShape(slot).choices ?? [];
    body = (
      <span className='inline-flex items-center'>
        <button
          type='button'
          aria-label={`${label} toggle`}
          className={`${token} ${tokenKinds.literal}`}
          onClick={() => ed.set(path, !expr)}
        >
          {String(expr)}
        </button>
        {!choices.length && opener('literal', '▾', 'change')}
      </span>
    );
  } else if (typeof expr === 'string') {
    const choices = (literalShape(slot).choices ?? []).filter((c) => typeof c === 'string') as string[];
    body = choices.length ? (
      <span className='inline-flex items-center'>
        <select
          aria-label={label}
          className={`${token} ${tokenKinds.literal}`}
          value={expr}
          onChange={(event) => ed.set(path, event.target.value)}
        >
          {[...new Set([expr, ...choices])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {opener('literal', '▾', 'change')}
      </span>
    ) : (
      <span className='inline-flex items-center'>
        <span className={punct}>'</span>
        <input
          aria-label={label}
          className={`${token} ${tokenKinds.literal} w-20`}
          value={expr}
          onChange={(event) => ed.set(path, event.target.value, { coalesce: `${ed.label}:${pathKey(path)}` })}
        />
        <span className={punct}>'</span>
        {opener('literal', '▾', 'change')}
      </span>
    );
  } else if (expr === null) body = opener('literal', 'null');
  else if (Array.isArray(expr)) body = <ListView items={expr} slot={slot} path={path} ed={ed} open={opener} />;
  else if ('ref' in expr) body = opener('ref', expr.ref);
  else if ('number' in expr)
    body = opener('literal', expr.number === 'Infinity' ? '∞' : expr.number === '-Infinity' ? '−∞' : 'NaN');
  else if ('value' in expr) body = opener('literal', describeJson(expr.value), 'a stored value');
  else if ('object' in expr) body = <ObjectView expr={expr} slot={slot} path={path} ed={ed} open={opener} />;
  else if ('op' in expr) body = <CallView expr={expr} path={path} ed={ed} open={opener} />;
  else if ('call' in expr) body = <FnCallView expr={expr} path={path} ed={ed} open={opener} />;
  else if ('math' in expr) body = <MathView expr={expr} slot={slot} path={path} ed={ed} open={opener} />;
  else
    body = (
      <span className='inline-flex flex-wrap items-center gap-0.5'>
        <Operand expr={expr.of} slot='unknown' path={[...path, 'of']} ed={ed} />
        {'index' in expr ? (
          <span className='inline-flex items-center'>
            <span className={punct}>[</span>
            <NumberInput
              label={`${label} index`}
              value={expr.index}
              onChange={(v) => Number.isInteger(v) && v >= 0 && ed.set(path, { ...expr, index: v })}
              narrow
            />
            <span className={punct}>]</span>
          </span>
        ) : (
          <span className={punct}>.{expr.field}</span>
        )}
        {opener('literal', '▾', 'change')}
      </span>
    );

  return (
    <span className='relative inline-flex flex-wrap items-center gap-0.5 align-top'>
      {name && expr !== undefined && <span className='text-[10px] text-dg-subtle'>{name}</span>}
      {body}
      {open && <OperandPicker expr={expr} slot={slot} path={path} ed={ed} optional={optional} onClose={close} />}
    </span>
  );
}

type Opener = (kind: keyof typeof tokenKinds, text: React.ReactNode, title?: string) => React.ReactNode;

/** Arguments inline when they are small, one per line (indented) when any of them is an expression of its own. */
function Args({ items, large }: { items: { key: string; node: React.ReactNode }[]; large: boolean }) {
  if (!large)
    return (
      <>
        {items.map((item, i) => (
          <span key={item.key} className='inline-flex items-center'>
            {item.node}
            {i < items.length - 1 && <span className={punct}>,</span>}
          </span>
        ))}
      </>
    );
  return (
    <span className='flex w-full flex-col gap-0.5 border-l border-dg-border pl-3'>
      {items.map((item) => (
        <span key={item.key} className='inline-flex'>
          {item.node}
        </span>
      ))}
    </span>
  );
}

function CallView({
  expr,
  path,
  ed,
  open,
}: {
  expr: Extract<Obj, { op: string }>;
  path: ExprPath;
  ed: Editing;
  open: Opener;
}) {
  const op = operationById.get(expr.op);
  const { head } = operationLabel(expr.op);
  const params = op?.params ?? [];
  const args = expr.args ?? {};
  const large = params.some(([name]) => isLarge(args[name])) || params.length > 3;
  const items = params.map(([name, s]) => {
    const at = [...path, 'args', name];
    if (isRest(s)) {
      const list = (Array.isArray(args[name]) ? args[name] : []) as Expr[];
      return {
        key: name,
        node: (
          <span className='inline-flex flex-wrap items-center gap-0.5'>
            <span className='text-[10px] text-dg-subtle'>…{name}</span>
            <ListView items={list} slot={[slotType(s)]} path={at} ed={ed} bare />
          </span>
        ),
      };
    }
    return {
      key: name,
      node: <Operand expr={args[name]} slot={slotType(s)} path={at} ed={ed} name={name} optional={isOptional(s)} />,
    };
  });
  const self =
    op && !op.static ? (
      <Operand expr={expr.self} slot={op.owner} path={[...path, 'self']} ed={ed} name={undefined} />
    ) : null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-0.5 ${large ? 'w-full' : ''}`}>
      {self}
      {open('op', op?.value ? head : head.replace(/\(\)$/, ''), expr.op)}
      {!op?.value && (
        <>
          <span className={punct}>(</span>
          <Args items={items} large={large} />
          <span className={punct}>)</span>
        </>
      )}
    </span>
  );
}

function FnCallView({
  expr,
  path,
  ed,
  open,
}: {
  expr: Extract<Obj, { call: string }>;
  path: ExprPath;
  ed: Editing;
  open: Opener;
}) {
  const fn = ed.fns.find((f) => f.name === expr.call);
  const args = expr.args ?? {};
  const params = fn?.params ?? Object.keys(args).map((name) => ({ name, type: 'unknown' }));
  const large = params.some((p) => isLarge(args[p.name]));
  const items = params.map((p) => ({
    key: p.name,
    node: (
      <Operand expr={args[p.name]} slot={safeType(p.type)} path={[...path, 'args', p.name]} ed={ed} name={p.name} />
    ),
  }));
  return (
    <span className={`inline-flex flex-wrap items-center gap-0.5 ${large ? 'w-full' : ''}`}>
      {open('op', expr.call)}
      <span className={punct}>(</span>
      <Args items={items} large={large} />
      <span className={punct}>)</span>
    </span>
  );
}
const safeType = (text: string): Type => {
  try {
    return parseTypeName(text);
  } catch {
    return 'unknown';
  }
};

function MathView({
  expr,
  slot,
  path,
  ed,
  open,
}: {
  expr: Extract<Obj, { math: string }>;
  slot: Type;
  path: ExprPath;
  ed: Editing;
  open: Opener;
}) {
  const operand = roleOf(slot) ?? 'number';
  if (expr.math === 'neg')
    return (
      <span className='inline-flex items-center gap-0.5'>
        {open('op', '−', 'negate')}
        <Operand expr={expr.args[0]} slot={operand} path={[...path, 'args', 0]} ed={ed} />
      </span>
    );
  return (
    <span className='inline-flex flex-wrap items-center gap-0.5'>
      <span className={punct}>(</span>
      <Operand expr={expr.args[0]} slot={operand} path={[...path, 'args', 0]} ed={ed} />
      <select
        aria-label={`${ed.label} ${path.join('.')} operator`}
        className={`${token} ${tokenKinds.op}`}
        value={expr.math}
        onChange={(event) => ed.set(path, { ...expr, math: event.target.value as MathOp })}
      >
        {(Object.keys(MATH_LABEL) as MathOp[]).map((op) => (
          <option key={op} value={op}>
            {MATH_LABEL[op]}
          </option>
        ))}
      </select>
      <Operand expr={expr.args[1]} slot={operand} path={[...path, 'args', 1]} ed={ed} />
      <span className={punct}>)</span>
      {open('literal', '▾', 'change')}
    </span>
  );
}

function ListView({
  items,
  slot,
  path,
  ed,
  open,
  bare,
}: {
  items: Expr[];
  slot: Type;
  path: ExprPath;
  ed: Editing;
  open?: Opener;
  /** A rest argument: no brackets of its own. */
  bare?: boolean;
}) {
  const item = itemOf(slot);
  const large = isLarge(items);
  const add = () => ed.set([...path, items.length], items.at(-1) ?? (literalShape(item).number ? 0 : null));
  const nodes = items.map((e, i) => ({
    key: String(i),
    node: (
      <span className='inline-flex items-center gap-0.5'>
        <Operand expr={e} slot={item} path={[...path, i]} ed={ed} />
        <button
          type='button'
          aria-label={`remove ${ed.label} ${[...path, i].join('.')}`}
          className='px-0.5 text-[10px] text-dg-subtle hover:text-red-600'
          onClick={() =>
            ed.set(
              path,
              items.filter((_, j) => j !== i),
            )
          }
        >
          ✕
        </button>
      </span>
    ),
  }));
  return (
    <span className={`inline-flex flex-wrap items-center gap-0.5 ${large ? 'w-full' : ''}`}>
      {!bare && <span className={punct}>[</span>}
      <Args items={nodes} large={large} />
      <button
        type='button'
        aria-label={`add to ${ed.label} ${path.join('.')}`}
        className={`${token} ${tokenKinds.ghost}`}
        onClick={add}
      >
        +
      </button>
      {!bare && <span className={punct}>]</span>}
      {open?.('literal', '▾', 'change')}
    </span>
  );
}

function ObjectView({
  expr,
  slot,
  path,
  ed,
  open,
}: {
  expr: Extract<Obj, { object: unknown }>;
  slot: Type;
  path: ExprPath;
  ed: Editing;
  open: Opener;
}) {
  const declared = fieldsOf(slot);
  const keys = [...new Set([...Object.keys(declared), ...Object.keys(expr.object)])];
  return (
    <span className='inline-flex flex-wrap items-center gap-0.5'>
      <span className={punct}>{'{'}</span>
      {keys.map((key) => (
        <Operand
          key={key}
          expr={expr.object[key]}
          slot={declared[key] ? slotType(declared[key]!) : 'unknown'}
          path={[...path, 'object', key]}
          ed={ed}
          name={key}
          optional={!declared[key] || isOptional(declared[key]!)}
        />
      ))}
      <span className={punct}>{'}'}</span>
      {open('literal', '▾', 'change')}
    </span>
  );
}
