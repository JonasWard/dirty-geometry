'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Cell, Definition, Fn, Input } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { NUMBER_TYPES, type Type } from '@dirty-geometry/vec2/schema/schema';
import {
  inputTypes,
  parseTypeName,
  typeName,
  typer,
  VALUE_CLASSES,
  widen,
  type Analysis,
  type Issue,
} from '@dirty-geometry/vec2/schema/typing';
import { describeValue } from './describe';
import { pathKey, type Editing } from './editor/context';
import { Operand } from './editor/ExpressionView';
import { useStoreApi, usePlayground } from './hooks';
import * as ops from './model/ops';
import { inputClass, NumberInput, selectClass, ValueEditor } from './widgets';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3';
const heading = 'text-xs font-bold tracking-widest text-dg-subtle uppercase';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';
const icon = 'px-1 text-xs text-dg-subtle hover:text-dg-ink disabled:opacity-30';
const PARAM_TYPES = [...NUMBER_TYPES, 'boolean', 'string', ...VALUE_CLASSES, ...VALUE_CLASSES.map((c) => `${c}[]`)];

/** Runs an edit; a refused edit (a name in use, a move past a use) shows why instead. */
function useEdit() {
  const store = useStoreApi();
  const [error, setError] = useState<string | null>(null);
  const edit = useCallback(
    (f: (d: Definition) => Definition, options?: { coalesce?: string }) => {
      try {
        store.getState().commit(f(store.getState().definition), options);
        setError(null);
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [store],
  );
  return { edit, error, clear: () => setError(null) };
}

/** A name field that renames on Enter or blur. */
function NameField({ name, label, onRename }: { name: string; label: string; onRename: (to: string) => void }) {
  const [text, setText] = useState(name);
  const [prev, setPrev] = useState(name);
  if (prev !== name) {
    setPrev(name);
    setText(name);
  }
  const apply = () => text.trim() && text.trim() !== name && onRename(text.trim());
  return (
    <input
      aria-label={label}
      className={`${inputClass} w-24 font-semibold`}
      value={text}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => event.key === 'Enter' && apply()}
    />
  );
}

const issuesBy = (issues: Issue[], kind: Issue['kind'], name: string) => {
  const map = new Map<string, string[]>();
  for (const issue of issues)
    if (issue.kind === kind && issue.name === name)
      map.set(pathKey(issue.path), [...(map.get(pathKey(issue.path)) ?? []), issue.message]);
  return map;
};
const Problems = ({ issues }: { issues: ReadonlyMap<string, string[]> }) =>
  issues.size ? (
    <ul className='mt-1 text-[11px] text-red-600'>
      {[...issues].flatMap(([path, messages]) =>
        messages.map((message) => <li key={`${path}:${message}`}>{message}</li>),
      )}
    </ul>
  ) : null;
const Refused = ({ error, onClear }: { error: string | null; onClear: () => void }) =>
  error ? (
    <div className='mb-2 flex items-center gap-2 text-xs text-red-600'>
      {error}
      <button type='button' className='underline' onClick={onClear}>
        ok
      </button>
    </div>
  ) : null;

// ---- inputs ----

export function InputsPanel({ analysis }: { analysis: Analysis }) {
  const definition = usePlayground((s) => s.definition);
  const { edit, error, clear } = useEdit();
  const [type, setType] = useState('Coordinate');
  return (
    <section className={panel} aria-label='Inputs'>
      <h3 className={`${heading} mb-2`}>Inputs</h3>
      <Refused error={error} onClear={clear} />
      <div className='space-y-1.5'>
        {definition.inputs.map((input) => (
          <InputRow
            key={input.name}
            input={input}
            issues={issuesBy(analysis.issues, 'input', input.name)}
            edit={edit}
          />
        ))}
      </div>
      <div className='mt-2 flex items-center gap-1 text-xs'>
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
    </section>
  );
}

function InputRow({
  input,
  issues,
  edit,
}: {
  input: Input;
  issues: ReadonlyMap<string, string[]>;
  edit: ReturnType<typeof useEdit>['edit'];
}) {
  const selected = usePlayground((s) => s.selected === input.name);
  const store = useStoreApi();
  const set = (value: Input['value']) =>
    edit((d) => ops.setInput(d, input.name, { value }), { coalesce: `input:${input.name}` });
  const value = input.value;
  let editor: React.ReactNode;
  if (typeof value === 'number') editor = <NumberInput label={`${input.name} value`} value={value} onChange={set} />;
  else if (typeof value === 'boolean')
    editor = (
      <input
        aria-label={`${input.name} value`}
        type='checkbox'
        checked={value}
        onChange={(e) => set(e.target.checked)}
      />
    );
  else if (typeof value === 'string')
    editor = (
      <input
        aria-label={`${input.name} value`}
        className={inputClass}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    );
  else if (value && typeof value === 'object' && 'value' in value)
    editor = (
      <ValueEditor
        label={`${input.name} value`}
        value={value.value as Record<string, unknown>}
        onChange={(json) => set({ value: json })}
      />
    );
  return (
    <div className={`rounded px-1 py-0.5 text-xs ${selected ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
      <div className='flex flex-wrap items-center gap-2'>
        <NameField
          name={input.name}
          label={`input ${input.name} name`}
          onRename={(to) => edit((d) => ops.rename(d, input.name, to))}
        />
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
        {editor}
        <span className='ml-auto flex'>
          <button
            type='button'
            className={icon}
            aria-label={`show ${input.name}`}
            onClick={() => store.getState().select(selected ? null : input.name)}
          >
            ◉
          </button>
          <button
            type='button'
            className={icon}
            aria-label={`remove input ${input.name}`}
            onClick={() => edit((d) => ops.removeInput(d, input.name))}
          >
            ✕
          </button>
        </span>
      </div>
      <Problems issues={issues} />
    </div>
  );
}

// ---- functions ----

export function FunctionsPanel({ analysis }: { analysis: Analysis }) {
  const definition = usePlayground((s) => s.definition);
  const { edit, error, clear } = useEdit();
  return (
    <section className={panel} aria-label='Functions'>
      <div className='mb-2 flex items-center justify-between'>
        <h3 className={heading}>Functions</h3>
        <button type='button' className={button} onClick={() => edit(ops.addFunction)}>
          + function
        </button>
      </div>
      <Refused error={error} onClear={clear} />
      {definition.functions.length === 0 && (
        <p className='text-xs text-dg-subtle'>
          A function is an expression with parameters, called from cells like an operation (it may call the functions
          above it).
        </p>
      )}
      <div className='space-y-2'>
        {definition.functions.map((fn, i) => (
          <FunctionRow key={fn.name} fn={fn} index={i} definition={definition} analysis={analysis} edit={edit} />
        ))}
      </div>
    </section>
  );
}

function FunctionRow({
  fn,
  index,
  definition,
  analysis,
  edit,
}: {
  fn: Fn;
  index: number;
  definition: Definition;
  analysis: Analysis;
  edit: ReturnType<typeof useEdit>['edit'];
}) {
  const ed = useMemo((): Editing => {
    const params = fn.params.map((p) => ({ name: p.name, type: safeType(p.type) }));
    const refs = new Map(params.map((p) => [p.name, p.type]));
    const earlier = new Map(
      [...analysis.fns].filter(([name]) => definition.functions.slice(0, index).some((f) => f.name === name)),
    );
    return {
      scope: params,
      fns: definition.functions.slice(0, index),
      typeOf: (e) => widen(typer([], 'function', fn.name).typeOf(e, { refs, fns: earlier })),
      issues: issuesBy(analysis.issues, 'function', fn.name),
      set: (path, e, options) => edit((d) => ops.setFunctionBody(d, fn.name, path, e), options),
      label: fn.name,
    };
  }, [fn, index, definition.functions, analysis, edit]);
  const returns = analysis.fns.get(fn.name)?.returns;
  return (
    <div className='rounded border border-dg-border/60 bg-white/70 p-2 text-xs'>
      <div className='flex flex-wrap items-center gap-1'>
        <span className='font-mono text-dg-subtle'>function</span>
        <NameField
          name={fn.name}
          label={`function ${fn.name} name`}
          onRename={(to) => edit((d) => ops.rename(d, fn.name, to))}
        />
        <span className='font-mono text-dg-subtle'>(</span>
        {fn.params.map((p) => (
          <span key={p.name} className='inline-flex items-center gap-0.5'>
            <NameField
              name={p.name}
              label={`${fn.name} param ${p.name}`}
              onRename={(to) => edit((d) => ops.renameParam(d, fn.name, p.name, to))}
            />
            <select
              aria-label={`${fn.name} param ${p.name} type`}
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
              className={icon}
              aria-label={`remove ${fn.name} param ${p.name}`}
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
        <span className='font-mono text-dg-subtle'>)</span>
        {returns && <span className='font-mono text-[10px] text-dg-subtle'>: {typeName(returns)}</span>}
        <button
          type='button'
          className={`${icon} ml-auto`}
          aria-label={`remove function ${fn.name}`}
          title='Remove; its calls get its body'
          onClick={() => edit((d) => ops.removeFunction(d, fn.name))}
        >
          ✕
        </button>
      </div>
      <div className='mt-1 flex items-start gap-1 pl-4'>
        <span className='font-mono text-dg-subtle'>return</span>
        <Operand expr={fn.body} slot='unknown' path={[]} ed={ed} />
      </div>
      <Problems issues={ed.issues} />
    </div>
  );
}
const safeType = (text: string): Type => {
  try {
    return parseTypeName(text);
  } catch {
    return 'unknown';
  }
};

// ---- cells ----

export function CellsPanel({ analysis, evaluation }: { analysis: Analysis; evaluation: Evaluation }) {
  const definition = usePlayground((s) => s.definition);
  const { edit, error, clear } = useEdit();
  return (
    <section className={panel} aria-label='Cells'>
      <h3 className={`${heading} mb-2`}>Cells</h3>
      <Refused error={error} onClear={clear} />
      <ol className='space-y-2'>
        {definition.cells.map((cell, i) => (
          <CellRow
            key={cell.name}
            cell={cell}
            index={i}
            definition={definition}
            analysis={analysis}
            evaluation={evaluation}
            edit={edit}
          />
        ))}
      </ol>
      <button
        type='button'
        className={`${button} mt-2`}
        onClick={() => edit((d) => ops.addCell(d, { op: 'Vec2.new', args: { x: 0, y: 0 } }))}
      >
        + cell
      </button>
    </section>
  );
}

function CellRow({
  cell,
  index,
  definition,
  analysis,
  evaluation,
  edit,
}: {
  cell: Cell;
  index: number;
  definition: Definition;
  analysis: Analysis;
  evaluation: Evaluation;
  edit: ReturnType<typeof useEdit>['edit'];
}) {
  const store = useStoreApi();
  const selected = usePlayground((s) => s.selected === cell.name);
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
      issues: issuesBy(analysis.issues, 'cell', cell.name),
      set: (path, e, options) =>
        path.length === 0 && e === undefined ? undefined : edit((d) => ops.setCellExpr(d, cell.name, path, e), options),
      extract: (path) => edit((d) => ops.extractCell(d, cell.name, path)),
      label: cell.name,
    };
  }, [cell.name, index, definition, analysis, edit]);
  const result = evaluation.cells.get(cell.name);
  const type = analysis.refs.get(cell.name);
  return (
    <li
      className={`rounded border p-2 text-xs ${selected ? 'border-amber-300 bg-amber-50/70' : 'border-dg-border/60 bg-white/70'}`}
      aria-label={`cell ${cell.name}`}
    >
      <div className='flex flex-wrap items-center gap-1'>
        <NameField
          name={cell.name}
          label={`cell ${cell.name} name`}
          onRename={(to) => edit((d) => ops.rename(d, cell.name, to))}
        />
        <input
          key={cell.type ?? ''}
          aria-label={`${cell.name} type`}
          className={`${inputClass} w-24 text-dg-subtle`}
          placeholder={type ? typeName(type) : 'type'}
          title='Declared type (optional): it decides how numbers in this cell are packed'
          defaultValue={cell.type ?? ''}
          onBlur={(e) => {
            const text = e.target.value.trim();
            if (text !== (cell.type ?? ''))
              edit((d) => ops.setCell(d, cell.name, { type: text ? typeName(parseTypeName(text)) : undefined }));
          }}
        />
        <label className='flex items-center gap-1 text-dg-subtle'>
          <input
            type='checkbox'
            aria-label={`${cell.name} is an output`}
            checked={cell.output === true}
            onChange={(e) => edit((d) => ops.setCell(d, cell.name, { output: e.target.checked || undefined }))}
          />
          output
        </label>
        <span className='ml-auto flex'>
          <button
            type='button'
            className={icon}
            aria-label={`show ${cell.name}`}
            onClick={() => store.getState().select(selected ? null : cell.name)}
          >
            ◉
          </button>
          <button
            type='button'
            className={icon}
            aria-label={`move ${cell.name} up`}
            disabled={index === 0}
            onClick={() => edit((d) => ops.moveCell(d, cell.name, -1))}
          >
            ↑
          </button>
          <button
            type='button'
            className={icon}
            aria-label={`move ${cell.name} down`}
            disabled={index === definition.cells.length - 1}
            onClick={() => edit((d) => ops.moveCell(d, cell.name, 1))}
          >
            ↓
          </button>
          <button
            type='button'
            className={icon}
            aria-label={`remove cell ${cell.name}`}
            title='Remove; the cells using it get its expression'
            onClick={() => edit((d) => ops.removeCell(d, cell.name))}
          >
            ✕
          </button>
        </span>
      </div>
      <div className='mt-1 flex items-start gap-1'>
        <span className='font-mono text-dg-subtle'>=</span>
        <Operand expr={cell.expr} slot={cell.type ? safeType(cell.type) : 'unknown'} path={[]} ed={ed} />
      </div>
      <div className='mt-1 font-mono text-[11px]'>
        {result && 'error' in result ? (
          <span className='text-red-600'>{result.error}</span>
        ) : (
          <span className='text-dg-subtle'>→ {describeValue(result?.value)}</span>
        )}
      </div>
      <Problems issues={ed.issues} />
    </li>
  );
}
