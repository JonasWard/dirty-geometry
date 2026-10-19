'use client';

import { useCallback, useState } from 'react';
import type { Expr } from '@dirty-geometry/vec2/recording/definition';
import type { ExprPath } from '@dirty-geometry/vec2/recording/expr';
import { isOptional, isRest, operationById, slotType, type Type } from '@dirty-geometry/vec2/schema/schema';
import { members, parseTypeName, roleOf } from '@dirty-geometry/vec2/schema/typing';
import { literalShape } from '../defaults';
import { describeJson } from '../describe';
import { methodsOf, partsOf } from '../model/ops';
import { operationLabel } from '../operations';
import { NumberInput } from '../widgets';
import { pathKey, type Editing } from './context';
import { OperandPicker } from './OperandPicker';

const token =
  'rounded border px-1 py-px font-mono text-[11px] leading-4 hover:border-dg-steel-600 focus:outline-none focus:ring-1 focus:ring-dg-steel-600';
const KIND = {
  ref: 'border-sky-300 bg-sky-50 text-sky-800',
  op: 'border-dg-border bg-white font-semibold text-dg-ink',
  literal: 'border-dg-border bg-white text-dg-ink',
  missing: 'border-dashed border-red-300 bg-red-50 text-red-700',
  ghost: 'border-dashed border-dg-border text-dg-subtle',
};
const punct = 'font-mono text-[11px] text-dg-subtle';
const MATH: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', neg: '−' };

/** A child slot: an argument, a list item or an options field. */
type Child = { key: string; expr: Expr | undefined; slot: Type; path: ExprPath; name?: string; optional?: boolean };
const safeType = (text: string): Type => {
  try {
    return parseTypeName(text);
  } catch {
    return 'unknown';
  }
};
const itemOf = (slot: Type): Type => (members(slot).find(Array.isArray) as Type[] | undefined)?.[0] ?? 'unknown';
/** Children go on lines of their own once one of them is an expression with arguments. */
const isLarge = (children: Child[]) =>
  children.some(({ expr: e }) => Array.isArray(e) || (e !== null && typeof e === 'object' && 'args' in e));

/** What stands in a slot, edited in place: its children are slots too, and its head opens a picker. */
export function Operand({ expr, slot, path, ed, name, optional }: Omit<Child, 'key'> & { ed: Editing }) {
  const [open, setOpen] = useState<'slot' | 'chain' | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const issues = ed.issues.get(pathKey(path));
  const label = `${ed.label} ${path.join('.') || 'expression'}`;
  const head = (kind: keyof typeof KIND, text: React.ReactNode, title?: string) => (
    <button
      type='button'
      aria-label={label}
      title={issues?.join('\n') ?? title}
      className={`${token} ${issues ? KIND.missing : KIND[kind]}`}
      onClick={() => setOpen(open ? null : 'slot')}
    >
      {text}
    </button>
  );
  const at = (...keys: ExprPath) => [...path, ...keys];

  let body: React.ReactNode;
  let children: Child[] = [];
  let brackets: [string, string] = ['(', ')'];
  let add: (() => void) | undefined;
  if (expr === undefined) body = head(optional ? 'ghost' : 'missing', optional ? `+ ${name ?? ''}` : `${name ?? '?'}?`);
  else if (typeof expr === 'number')
    body = (
      <>
        <NumberInput
          label={label}
          value={expr}
          onChange={(v) => ed.set(path, v, { coalesce: `${ed.label}:${pathKey(path)}` })}
          narrow
        />
        {head('literal', '▾', 'change')}
      </>
    );
  else if (typeof expr === 'boolean')
    body = (
      <>
        <button type='button' className={`${token} ${KIND.literal}`} onClick={() => ed.set(path, !expr)}>
          {String(expr)}
        </button>
        {head('literal', '▾', 'change')}
      </>
    );
  else if (typeof expr === 'string' || expr === null) body = head('literal', expr === null ? 'null' : `'${expr}'`);
  else if (Array.isArray(expr)) {
    body = head('literal', '[', 'a list');
    brackets = ['', ']'];
    children = expr.map((e, i) => ({ key: String(i), expr: e, slot: itemOf(slot), path: at(i) }));
    add = () => ed.set(at(expr.length), expr.at(-1) ?? (literalShape(itemOf(slot)).number ? 0 : null));
  } else if ('ref' in expr) body = head('ref', expr.ref);
  else if ('number' in expr) body = head('literal', { Infinity: '∞', '-Infinity': '−∞', NaN: 'NaN' }[expr.number]);
  else if ('value' in expr) body = head('literal', describeJson(expr.value), 'a stored value');
  else if ('object' in expr) {
    const fields = literalShape(slot).object ?? {};
    body = head('literal', '{', 'options');
    brackets = ['', '}'];
    children = [...new Set([...Object.keys(fields), ...Object.keys(expr.object)])].map((key) => ({
      key,
      name: key,
      expr: expr.object[key],
      slot: fields[key] ? slotType(fields[key]!) : 'unknown',
      path: at('object', key),
      optional: !fields[key] || isOptional(fields[key]!),
    }));
  } else if ('op' in expr) {
    const op = operationById.get(expr.op);
    const self = op && !op.static ? <Operand expr={expr.self} slot={op.owner} path={at('self')} ed={ed} /> : null;
    body = (
      <>
        {self}
        {head('op', operationLabel(expr.op).head.replace(/\(\)$/, ''), expr.op)}
      </>
    );
    if (op?.value) brackets = ['', ''];
    children = (op?.params ?? []).map(([key, s]) => ({
      key,
      name: isRest(s) ? `…${key}` : key,
      expr: expr.args?.[key],
      slot: isRest(s) ? [slotType(s)] : slotType(s),
      path: at('args', key),
      optional: isOptional(s) || isRest(s),
    }));
  } else if ('call' in expr) {
    body = head('op', expr.call);
    const params = ed.fns.find((f) => f.name === expr.call)?.params ?? [];
    children = params.map((p) => ({
      key: p.name,
      name: p.name,
      expr: expr.args?.[p.name],
      slot: safeType(p.type),
      path: at('args', p.name),
    }));
  } else if ('math' in expr) {
    const operand = roleOf(slot) ?? 'number';
    const [a, b] = expr.args.map((e, i) => <Operand key={i} expr={e} slot={operand} path={at('args', i)} ed={ed} />);
    body = (
      <>
        {expr.math !== 'neg' && <span className={punct}>(</span>}
        {expr.math !== 'neg' && a}
        {head('op', MATH[expr.math], 'arithmetic')}
        {expr.math === 'neg' ? a : b}
        {expr.math !== 'neg' && <span className={punct}>)</span>}
      </>
    );
  } else
    body = (
      <>
        <Operand expr={expr.of} slot='unknown' path={at('of')} ed={ed} />
        {'index' in expr ? (
          <>
            <span className={punct}>[</span>
            <NumberInput
              label={`${label} index`}
              value={expr.index}
              onChange={(v) => ed.set(at('index'), Math.max(0, Math.round(v)))}
              narrow
            />
            {head('literal', ']', 'change')}
          </>
        ) : (
          head('literal', `.${expr.field}`)
        )}
      </>
    );

  const large = isLarge(children);
  const listed = children.length > 0 || brackets[1] !== ')' || add;
  // A chain grows from any value with methods or parts: `.` appends one (`x.scale(…)`, `x.polygons`, `x[0]`).
  const chain = expr !== undefined && typeof expr === 'object' && expr !== null && !Array.isArray(expr);
  const methods = chain && (methodsOf(ed.typeOf(expr)).length > 0 || partsOf(ed.typeOf(expr)).length > 0);
  return (
    <span className='group/operand relative inline-flex flex-wrap items-center gap-0.5 align-top'>
      {name && expr !== undefined && <span className='text-[10px] text-dg-subtle'>{name}</span>}
      {body}
      {listed && brackets[0] !== '' && <span className={punct}>{brackets[0]}</span>}
      {(children.length > 0 || add) && (
        <span className={large ? 'flex w-full flex-col gap-0.5 border-l border-dg-border pl-3' : 'contents'}>
          {children.map((child, i) => (
            <span key={child.key} className='inline-flex items-center'>
              <Operand {...child} ed={ed} />
              {add && (
                <button
                  type='button'
                  aria-label={`remove ${ed.label} ${child.path.join('.')}`}
                  className='px-0.5 text-[10px] text-dg-subtle hover:text-red-600'
                  onClick={() => ed.set(child.path, undefined)}
                >
                  ✕
                </button>
              )}
              {!large && i < children.length - 1 && <span className={punct}>,</span>}
            </span>
          ))}
          {add && (
            <button
              type='button'
              aria-label={`add to ${label}`}
              className={`${token} ${KIND.ghost} self-start`}
              onClick={add}
            >
              +
            </button>
          )}
        </span>
      )}
      {listed && brackets[1] !== '' && <span className={punct}>{brackets[1]}</span>}
      {methods && (
        <button
          type='button'
          aria-label={`chain on ${label}`}
          title='Read a field or item, or call a method on this value'
          className={`${token} ${KIND.ghost} opacity-0 group-hover/operand:opacity-100 focus:opacity-100`}
          onClick={() => setOpen('chain')}
        >
          .
        </button>
      )}
      {open && (
        <OperandPicker
          expr={expr}
          slot={slot}
          path={path}
          ed={ed}
          optional={optional}
          chain={open === 'chain'}
          onClose={close}
        />
      )}
    </span>
  );
}
