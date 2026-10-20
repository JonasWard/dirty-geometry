'use client';

import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { Definition, Fn, Input } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { NUMBER_TYPES, type Type } from '@dirty-geometry/vec2/schema/schema';
import {
  inputTypes,
  parseTypeName,
  typer,
  VALUE_CLASSES,
  widen,
  type Analysis,
} from '@dirty-geometry/vec2/schema/typing';
import { describeValue } from './describe';
import { pathKey, type Editing } from './editor/context';
import { Operand } from './editor/ExpressionView';
import * as ops from './model/ops';
import { usePlayground, useStoreApi } from './store';
import { inputClass, NumberInput, selectClass, ValueEditor } from './widgets';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3 text-xs';
const heading = 'mb-2 text-xs font-bold tracking-widest text-dg-subtle uppercase';
const row = 'rounded border border-dg-border/60 bg-white/70 p-2';
const button = 'rounded border border-dg-border px-2 py-0.5 hover:border-dg-steel-600 hover:text-dg-steel-600';
const remove = 'ml-auto px-1 text-dg-subtle hover:text-red-600';
const PARAM_TYPES = [...NUMBER_TYPES, 'boolean', 'string', ...VALUE_CLASSES, ...VALUE_CLASSES.map((c) => `${c}[]`)];
type Edit = (f: (d: Definition) => Definition, options?: { coalesce?: string }) => void;

/** Runs an edit through the store; an edit that is refused (a name in use) shows why. */
function useEdit(): [Edit, string | null] {
  const store = useStoreApi();
  const [error, setError] = useState<string | null>(null);
  const edit = useCallback<Edit>(
    (f, options) => {
      try {
        store.getState().commit(f(store.getState().definition), options);
        setError(null);
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [store],
  );
  return [edit, error];
}

/** A name that renames on Enter or blur; focusing it shows that input or cell on the canvas. */
function NameField({ name, onRename }: { name: string; onRename: (to: string) => void }) {
  const store = useStoreApi();
  const [text, setText] = useState(name);
  const [prev, setPrev] = useState(name);
  if (prev !== name) {
    setPrev(name);
    setText(name);
  }
  const apply = () => text.trim() && text.trim() !== name && onRename(text.trim());
  return (
    <input
      aria-label={`${name} name`}
      className={`${inputClass} w-24 font-semibold`}
      value={text}
      spellCheck={false}
      onFocus={() => store.getState().select(name)}
      onChange={(event) => setText(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => event.key === 'Enter' && apply()}
    />
  );
}

/** Problems of one input, function or cell (and a refused edit), by path. */
const issuesOf = (analysis: Analysis, name: string) => {
  const map = new Map<string, string[]>();
  for (const issue of analysis.issues)
    if (issue.name === name) map.set(pathKey(issue.path), [...(map.get(pathKey(issue.path)) ?? []), issue.message]);
  return map;
};
const Messages = ({ list }: { list: (string | null | undefined)[] }) =>
  list.some(Boolean) ? <p className='mt-1 text-[11px] text-red-600'>{list.filter(Boolean).join(' · ')}</p> : null;
const safeType = (text: string): Type => {
  try {
    return parseTypeName(text);
  } catch {
    return 'unknown';
  }
};

// ---- reordering: a drag handle and up / down buttons ----

type Reorder = { row: (name: string) => RowDrop; controls: (name: string, index: number) => ReactNode };
type RowDrop = {
  className: string;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};
const below = (event: DragEvent<HTMLElement>) => {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
};
const small = 'px-0.5 text-dg-subtle hover:text-dg-steel-600 disabled:opacity-30 disabled:hover:text-dg-subtle';

/**
 * Moving the rows of one list (`kind`): drop a dragged row above or below another, or step it up and down. Only
 * the handle drags, so the fields in a row keep their text selection.
 */
function useReorder(kind: 'cell' | 'function', names: readonly string[], onMove: (name: string, to: number) => void) {
  const type = `application/x-dg-${kind}`;
  const [drop, setDrop] = useState<{ name: string; below: boolean } | null>(null);
  const row = (name: string): RowDrop => ({
    className: drop?.name === name ? (drop.below ? 'shadow-[0_3px_0_0_#5eb0d4]' : 'shadow-[0_-3px_0_0_#5eb0d4]') : '',
    onDragOver: (event) => {
      if (!event.dataTransfer.types.includes(type)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const after = below(event);
      if (drop?.name !== name || drop.below !== after) setDrop({ name, below: after });
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setDrop((d) => (d?.name === name ? null : d));
    },
    onDrop: (event) => {
      const moved = event.dataTransfer.getData(type);
      setDrop(null);
      if (!moved) return;
      event.preventDefault();
      const from = names.indexOf(moved);
      const to = names.indexOf(name) + (below(event) ? 1 : 0);
      onMove(moved, from < to ? to - 1 : to);
    },
  });
  const controls = (name: string, index: number) => (
    <span className='inline-flex items-center'>
      <span
        role='button'
        draggable
        aria-label={`drag ${name}`}
        title='Drag to move'
        className='cursor-grab px-0.5 text-dg-subtle select-none hover:text-dg-steel-600 active:cursor-grabbing'
        onDragStart={(event) => {
          event.dataTransfer.setData(type, name);
          event.dataTransfer.effectAllowed = 'move';
          const element = event.currentTarget.closest('[data-reorder-row]');
          if (element) event.dataTransfer.setDragImage(element, 12, 12);
        }}
        onDragEnd={() => setDrop(null)}
      >
        ⋮⋮
      </span>
      <button
        type='button'
        className={small}
        aria-label={`move ${name} up`}
        disabled={index === 0}
        onClick={() => onMove(name, index - 1)}
      >
        ↑
      </button>
      <button
        type='button'
        className={small}
        aria-label={`move ${name} down`}
        disabled={index === names.length - 1}
        onClick={() => onMove(name, index + 1)}
      >
        ↓
      </button>
    </span>
  );
  return { row, controls } satisfies Reorder;
}

export function InputsPanel({ analysis }: { analysis: Analysis }) {
  const inputs = usePlayground((s) => s.definition.inputs);
  const [edit, error] = useEdit();
  const [type, setType] = useState('Coordinate');
  return (
    <section className={panel} aria-label='Inputs'>
      <h3 className={heading}>Inputs</h3>
      {inputs.map((input) => (
        <InputRow
          key={input.name}
          input={input}
          edit={edit}
          issues={[...issuesOf(analysis, input.name).values()].flat()}
        />
      ))}
      <div className='mt-2 flex items-center gap-1'>
        <select
          aria-label='new input type'
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {inputTypes().map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button type='button' className={button} onClick={() => edit((d) => ops.addInput(d, type))}>
          + input
        </button>
      </div>
      <Messages list={[error]} />
    </section>
  );
}

/** The value of an input, edited by its kind: a number, a checkbox, text, or a stored vec2 value. */
export function InputValueEditor({ input, onChange }: { input: Input; onChange: (value: Input['value']) => void }) {
  const { value } = input;
  const label = `${input.name} value`;
  return typeof value === 'number' ? (
    <NumberInput label={label} value={value} onChange={onChange} />
  ) : typeof value === 'boolean' ? (
    <input aria-label={label} type='checkbox' checked={value} onChange={(e) => onChange(e.target.checked)} />
  ) : typeof value === 'string' ? (
    <input aria-label={label} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
  ) : value && typeof value === 'object' && 'value' in value ? (
    <ValueEditor
      label={label}
      value={value.value as Record<string, unknown>}
      onChange={(json) => onChange({ value: json })}
    />
  ) : null;
}

function InputRow({ input, edit, issues }: { input: Input; edit: Edit; issues: string[] }) {
  const set = (value: Input['value']) =>
    edit((d) => ops.setInput(d, input.name, { value }), { coalesce: `input:${input.name}` });
  return (
    <div className='mb-1'>
      <div className='flex flex-wrap items-center gap-2'>
        <NameField name={input.name} onRename={(to) => edit((d) => ops.rename(d, input.name, to))} />
        <select
          aria-label={`${input.name} type`}
          className={selectClass}
          value={input.type}
          onChange={(e) => edit((d) => ops.setInputType(d, input.name, e.target.value))}
        >
          {[...new Set([input.type, ...inputTypes()])].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <InputValueEditor input={input} onChange={set} />
        <button
          type='button'
          className={remove}
          aria-label={`remove ${input.name}`}
          onClick={() => edit((d) => ops.removeInput(d, input.name))}
        >
          ✕
        </button>
      </div>
      <Messages list={issues} />
    </div>
  );
}

export function FunctionsPanel({ analysis }: { analysis: Analysis }) {
  const functions = usePlayground((s) => s.definition.functions);
  const [edit, error] = useEdit();
  const names = useMemo(() => functions.map((f) => f.name), [functions]);
  const reorder = useReorder('function', names, (name, to) => edit((d) => ops.moveFunction(d, name, to)));
  return (
    <section className={panel} aria-label='Functions'>
      <div className='flex items-center justify-between'>
        <h3 className={heading}>Functions</h3>
        <button type='button' className={button} onClick={() => edit(ops.addFunction)}>
          + function
        </button>
      </div>
      {functions.length === 0 && (
        <p className='text-dg-subtle'>An expression with parameters, called from cells like an operation.</p>
      )}
      <div className='space-y-2'>
        {functions.map((fn, i) => (
          <FunctionRow
            key={fn.name}
            fn={fn}
            index={i}
            earlier={functions.slice(0, i)}
            analysis={analysis}
            edit={edit}
            reorder={reorder}
          />
        ))}
      </div>
      <Messages list={[error]} />
    </section>
  );
}

function FunctionRow({
  fn,
  index,
  earlier,
  analysis,
  edit,
  reorder,
}: {
  fn: Fn;
  index: number;
  earlier: Fn[];
  analysis: Analysis;
  edit: Edit;
  reorder: Reorder;
}) {
  const ed = useMemo((): Editing => {
    const scope = fn.params.map((p) => ({ name: p.name, type: safeType(p.type) }));
    const refs = new Map(scope.map((p) => [p.name, p.type]));
    return {
      scope,
      fns: earlier,
      typeOf: (e) => widen(typer([], 'function', fn.name).typeOf(e, { refs, fns: analysis.fns })),
      issues: issuesOf(analysis, fn.name),
      set: (path, e, options) => edit((d) => ops.setFunctionBody(d, fn.name, path, e), options),
      label: fn.name,
    };
  }, [fn, earlier, analysis, edit]);
  const { className, ...drop } = reorder.row(fn.name);
  return (
    <div className={`${row} ${className}`} data-reorder-row {...drop}>
      <div className='flex flex-wrap items-center gap-1 font-mono'>
        {reorder.controls(fn.name, index)}
        <span className='text-dg-subtle'>function</span>
        <NameField name={fn.name} onRename={(to) => edit((d) => ops.rename(d, fn.name, to))} />(
        {fn.params.map((p) => (
          <span key={p.name} className='inline-flex items-center gap-0.5'>
            {p.name}:
            <select
              aria-label={`${fn.name} ${p.name} type`}
              className={selectClass}
              value={p.type}
              onChange={(e) => edit((d) => ops.setParamType(d, fn.name, p.name, e.target.value))}
            >
              {[...new Set([p.type, ...PARAM_TYPES])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button
              type='button'
              className='text-dg-subtle hover:text-red-600'
              aria-label={`remove ${fn.name} ${p.name}`}
              onClick={() => edit((d) => ops.removeParam(d, fn.name, p.name))}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type='button'
          className={button}
          aria-label={`add ${fn.name} param`}
          onClick={() => edit((d) => ops.addParam(d, fn.name))}
        >
          +
        </button>
        )
        <button
          type='button'
          className={remove}
          aria-label={`remove ${fn.name}`}
          title='Its calls get its body'
          onClick={() => edit((d) => ops.removeFunction(d, fn.name))}
        >
          ✕
        </button>
      </div>
      <div className='mt-1 flex items-start gap-1 pl-4'>
        <span className='font-mono text-dg-subtle'>return</span>
        <Operand expr={fn.body} slot='unknown' path={[]} ed={ed} />
      </div>
      <Messages list={[...ed.issues.values()].flat()} />
    </div>
  );
}

export function CellsPanel({ analysis, evaluation }: { analysis: Analysis; evaluation: Evaluation }) {
  const definition = usePlayground((s) => s.definition);
  const selected = usePlayground((s) => s.selected);
  const [edit, error] = useEdit();
  const names = useMemo(() => definition.cells.map((c) => c.name), [definition.cells]);
  const reorder = useReorder('cell', names, (name, to) => edit((d) => ops.moveCell(d, name, to)));
  return (
    <section className={panel} aria-label='Cells'>
      <h3 className={heading}>Cells</h3>
      <ol className='space-y-2'>
        {definition.cells.map((cell, i) => {
          const result = evaluation.cells.get(cell.name);
          return (
            <CellRow
              key={cell.name}
              index={i}
              definition={definition}
              analysis={analysis}
              edit={edit}
              reorder={reorder}
              selected={selected === cell.name}
              result={result && 'error' in result ? { error: result.error } : { value: describeValue(result?.value) }}
            />
          );
        })}
      </ol>
      <button
        type='button'
        className={`${button} mt-2`}
        onClick={() => edit((d) => ops.addCell(d, { op: 'Vec2.new', args: { x: 0, y: 0 } }))}
      >
        + cell
      </button>
      <Messages list={[error]} />
    </section>
  );
}

function CellRow({
  index,
  definition,
  analysis,
  edit,
  reorder,
  selected,
  result,
}: {
  index: number;
  definition: Definition;
  analysis: Analysis;
  edit: Edit;
  reorder: Reorder;
  selected: boolean;
  result: { error: string } | { value: string };
}) {
  const cell = definition.cells[index]!;
  const ed = useMemo((): Editing => {
    const scope = [...definition.inputs, ...definition.cells.slice(0, index)].map((b) => ({
      name: b.name,
      type: analysis.refs.get(b.name) ?? 'unknown',
    }));
    const refs = new Map(scope.map((b) => [b.name, b.type]));
    return {
      scope,
      fns: definition.functions,
      typeOf: (e) => widen(typer([], 'cell', cell.name).typeOf(e, { refs, fns: analysis.fns })),
      issues: issuesOf(analysis, cell.name),
      set: (path, e, options) =>
        path.length === 0 && e === undefined ? undefined : edit((d) => ops.setCellExpr(d, cell.name, path, e), options),
      label: cell.name,
    };
  }, [cell.name, index, definition, analysis, edit]);
  const outputs = useMemo(() => ops.outputTypes(ed.typeOf(cell.expr)), [ed, cell.expr]);
  const { className, ...drop } = reorder.row(cell.name);
  return (
    <li
      className={`${row} ${selected ? 'border-amber-300 bg-amber-50/70' : ''} ${className}`}
      aria-label={`cell ${cell.name}`}
      data-reorder-row
      {...drop}
    >
      <div className='flex items-center gap-2'>
        {reorder.controls(cell.name, index)}
        <NameField name={cell.name} onRename={(to) => edit((d) => ops.rename(d, cell.name, to))} />
        <label
          className='flex items-center gap-1 text-dg-subtle'
          title='An output is returned by the definition, with this type'
        >
          output
          <select
            aria-label={`${cell.name} output type`}
            className={selectClass}
            value={cell.output ? (cell.type ?? '') : ''}
            onChange={(e) =>
              edit((d) =>
                ops.setCell(
                  d,
                  cell.name,
                  e.target.value ? { output: true, type: e.target.value } : { output: undefined, type: undefined },
                ),
              )
            }
          >
            <option value=''>—</option>
            {[...new Set([...(cell.output && cell.type ? [cell.type] : []), ...outputs])].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button
          type='button'
          className={remove}
          aria-label={`remove cell ${cell.name}`}
          title='Cells using it get its expression'
          onClick={() => edit((d) => ops.removeCell(d, cell.name))}
        >
          ✕
        </button>
      </div>
      <div className='mt-1 flex items-start gap-1'>
        <span className='font-mono text-dg-subtle'>=</span>
        <Operand expr={cell.expr} slot={cell.type ? safeType(cell.type) : 'unknown'} path={[]} ed={ed} />
      </div>
      <p className={`mt-1 font-mono text-[11px] ${'error' in result ? 'text-red-600' : 'text-dg-subtle'}`}>
        {'error' in result ? result.error : `→ ${result.value}`}
      </p>
      <Messages list={[...ed.issues.values()].flat()} />
    </li>
  );
}
