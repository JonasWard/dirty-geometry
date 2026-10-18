'use client';

import { useMemo, useState } from 'react';
import type { Arg, Definition, Node } from '@dirty-geometry/vec2/recording/definition';
import { isOptional, isRest, operations, slotType } from '@dirty-geometry/vec2/schema/schema';
import { DEFAULT_VALUES } from './defaults';
import { describeValue } from './describe';
import {
  addNode,
  addParam,
  argOf,
  isCallNode,
  keyOf,
  moveNode,
  operationOf,
  ownerOf,
  removeArg,
  removeNode,
  removeParam,
  replaceOperation,
  setArg,
  setOutput,
  setParamValue,
  setSelf,
  sourceKey,
  sourceOf,
} from './editing';
import { OPERATION_GROUPS, operationLabel } from './operations';
import { NumberInput, OperandEditor, ValueEditor, type NodeChoice } from './OperandEditor';

const panel = 'rounded-md border border-dg-border bg-white/60 p-3';
const button = 'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600';
const selectClass =
  'rounded border border-dg-border bg-white px-1.5 py-0.5 font-mono text-xs text-dg-ink focus:border-dg-steel-600 focus:outline-none';

/** Every recordable operation, for the "all operations" group. */
const ALL_OPERATIONS = operations.map(keyOf);
const CURATED = new Set(OPERATION_GROUPS.flatMap((group) => group.ops));

export function OperationSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (op: string) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className={`${selectClass} max-w-56`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {value === '' && <option value=''>Add an operation…</option>}
      {OPERATION_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.ops.map((op) => (
            <option key={op} value={op}>
              {operationLabel(op)}
            </option>
          ))}
        </optgroup>
      ))}
      <optgroup label='All operations'>
        {ALL_OPERATIONS.filter((op) => !CURATED.has(op)).map((op) => (
          <option key={op} value={op}>
            {operationLabel(op)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

type BuilderProps = {
  definition: Definition;
  values: ReadonlyMap<string, unknown>;
  issues: ReadonlyMap<string, string[]>;
  failure?: { node: string; message: string };
  selected: string | null;
  step: (numberType: string) => number | undefined;
  onSelect: (node: string | null) => void;
  onChange: (definition: Definition) => void;
};

function nodeLabel(node: Node, definition: Definition, values: ReadonlyMap<string, unknown>): string {
  const output = Object.entries(definition.outputs).find(([, id]) => id === node.id)?.[0];
  return `${node.id}${output ? ` ${output}` : ''} · ${describeValue(values.get(node.id))}`;
}

/** `n3[2]` for array items, `n4.polygons` for result fields. */
const structuralLabel = (node: Node) =>
  'index' in node ? `${node.of}[${node.index}]` : 'name' in node ? `${node.of}.${node.name}` : node.op;

function ParamsPanel({ definition, step, onChange }: Pick<BuilderProps, 'definition' | 'step' | 'onChange'>) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'number' | 'Vec2' | 'boolean'>('number');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    try {
      const value: Arg = kind === 'number' ? 1 : kind === 'boolean' ? false : { value: DEFAULT_VALUES.Vec2 };
      onChange(addParam(definition, name.trim(), value, kind));
      setName('');
      setError(null);
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <section className={panel} aria-label='Params'>
      <h3 className='mb-2 text-xs font-bold tracking-widest text-dg-subtle uppercase'>Params</h3>
      <div className='space-y-1.5'>
        {Object.entries(definition.params).map(([paramName, param]) => (
          <div key={paramName} className='flex flex-wrap items-center gap-2 text-xs'>
            <span className='w-24 truncate font-mono font-semibold' title={paramName}>
              {paramName}
            </span>
            {typeof param.value === 'number' ? (
              <NumberInput
                label={`param ${paramName}`}
                value={param.value}
                step={step('coordinate')}
                onChange={(value) => onChange(setParamValue(definition, paramName, value))}
              />
            ) : typeof param.value === 'boolean' ? (
              <input
                aria-label={`param ${paramName}`}
                type='checkbox'
                checked={param.value}
                onChange={(event) => onChange(setParamValue(definition, paramName, event.target.checked))}
              />
            ) : param.value && typeof param.value === 'object' && 'value' in param.value ? (
              <ValueEditor
                label={`param ${paramName}`}
                value={param.value.value as Record<string, any>}
                onChange={(value) => onChange(setParamValue(definition, paramName, { value }))}
              />
            ) : (
              <span className='font-mono'>{JSON.stringify(param.value)}</span>
            )}
            <button
              type='button'
              className={`${button} ml-auto`}
              onClick={() => onChange(removeParam(definition, paramName))}
            >
              remove
            </button>
          </div>
        ))}
      </div>
      <form
        className='mt-2 flex flex-wrap items-center gap-1 text-xs'
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          aria-label='new param name'
          className={selectClass}
          placeholder='name'
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          aria-label='new param kind'
          className={selectClass}
          value={kind}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        >
          <option value='number'>number</option>
          <option value='Vec2'>Vec2</option>
          <option value='boolean'>boolean</option>
        </select>
        <button type='submit' className={button} disabled={!name.trim()}>
          + param
        </button>
        {error && <span className='text-red-600'>{error}</span>}
      </form>
    </section>
  );
}

function NodeRow({
  node,
  position,
  definition,
  values,
  issues,
  failure,
  selected,
  step,
  onSelect,
  onChange,
}: BuilderProps & { node: Node; position: number }) {
  const op = isCallNode(node) ? operationOf(node) : undefined;
  const earlier: NodeChoice[] = useMemo(
    () => [
      ...Object.keys(definition.params).map((param) => ({ id: `param:${param}`, label: `${param} (param)` })),
      ...definition.nodes
        .slice(0, position)
        .map((candidate) => ({ id: candidate.id, label: nodeLabel(candidate, definition, values) })),
    ],
    [definition, position, values],
  );
  const output = Object.entries(definition.outputs).find(([, id]) => id === node.id)?.[0];
  const problems = [...(issues.get(node.id) ?? []), ...(failure?.node === node.id ? [failure.message] : [])];
  const isSelected = selected === node.id;

  return (
    <li
      className={`rounded border p-2 text-xs ${isSelected ? 'border-amber-500 bg-amber-50' : 'border-dg-border bg-white'} ${
        problems.length ? 'border-l-4 border-l-red-500' : ''
      }`}
      onClick={() => onSelect(node.id)}
      data-node={node.id}
    >
      <div className='flex flex-wrap items-center gap-1.5'>
        <span className='w-7 font-mono text-dg-subtle'>{node.id}</span>
        {isCallNode(node) ? (
          <OperationSelect
            label={`${node.id} operation`}
            value={op ? keyOf(op) : node.op}
            onChange={(next) => onChange(replaceOperation(definition, node.id, next, values))}
          />
        ) : (
          <span className='font-mono'>{structuralLabel(node)}</span>
        )}
        {op && !op.static && isCallNode(node) && (
          <>
            <span className='text-dg-subtle'>on</span>
            <select
              aria-label={`${node.id} self`}
              className={selectClass}
              value={sourceKey(node.self)}
              onChange={(event) => onChange(setSelf(definition, node.id, sourceOf(event.target.value)))}
            >
              {!earlier.some((choice) => choice.id === sourceKey(node.self)) && (
                <option value={sourceKey(node.self)}>pick a {ownerOf(op)}</option>
              )}
              {earlier.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </>
        )}
        <span className='ml-auto flex items-center gap-1'>
          <label className='flex items-center gap-1 text-dg-subtle'>
            output
            <input
              aria-label={`${node.id} output name`}
              className={`${selectClass} w-20`}
              placeholder='—'
              value={output ?? ''}
              onChange={(event) =>
                onChange(setOutput(definition, node.id, event.target.value.replace(/[^\w$-]/g, '') || null))
              }
            />
          </label>
          <button
            type='button'
            className={button}
            aria-label={`move ${node.id} up`}
            onClick={() => onChange(moveNode(definition, node.id, -1))}
          >
            ↑
          </button>
          <button
            type='button'
            className={button}
            aria-label={`move ${node.id} down`}
            onClick={() => onChange(moveNode(definition, node.id, 1))}
          >
            ↓
          </button>
          <button
            type='button'
            className={button}
            aria-label={`remove ${node.id}`}
            onClick={() => onChange(removeNode(definition, node.id))}
          >
            ✕
          </button>
        </span>
      </div>

      {op && isCallNode(node) && op.params.length > 0 && (
        <div className='mt-1.5 space-y-1 pl-8'>
          {op.params.map(([paramName, slot], index) => {
            const args = node.args ?? [];
            if (isRest(slot)) {
              const rest = args.slice(index);
              return (
                <div key={paramName} className='flex flex-wrap items-start gap-1'>
                  <span className='w-24 font-mono text-dg-subtle'>...{paramName}</span>
                  <div className='space-y-1'>
                    {rest.map((arg, offset) => (
                      <div key={offset} className='flex items-start gap-1'>
                        <OperandEditor
                          name={`${paramName}[${offset}]`}
                          type={slotType(slot)}
                          optional={false}
                          arg={arg}
                          nodes={earlier}
                          step={step}
                          onChange={(next) => onChange(setArg(definition, node.id, index + offset, next))}
                        />
                        <button
                          type='button'
                          className={button}
                          onClick={() => onChange(removeArg(definition, node.id, index + offset))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type='button'
                      className='text-dg-steel-600 hover:underline'
                      onClick={() =>
                        onChange(setArg(definition, node.id, args.length, argOf(earlier.at(-1)?.id ?? '')))
                      }
                    >
                      + {paramName}
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={paramName} className='flex flex-wrap items-start gap-1'>
                <span className='w-24 font-mono text-dg-subtle' title={JSON.stringify(slotType(slot))}>
                  {paramName}
                  {isOptional(slot) ? '?' : ''}
                </span>
                <OperandEditor
                  name={paramName}
                  type={slotType(slot)}
                  optional={isOptional(slot)}
                  arg={args[index]}
                  nodes={earlier}
                  step={step}
                  onChange={(next) => onChange(setArg(definition, node.id, index, next))}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className='mt-1 pl-8 font-mono text-dg-subtle'>= {describeValue(values.get(node.id))}</div>
      {problems.map((problem) => (
        <div key={problem} className='mt-0.5 pl-8 text-red-600'>
          {problem}
        </div>
      ))}
    </li>
  );
}

/** DOM method builder: params, then one row per node with dropdowns for its operation and operands. */
export function Builder(props: BuilderProps) {
  const { definition, values, onChange } = props;
  return (
    <div className='space-y-3'>
      <ParamsPanel definition={definition} step={props.step} onChange={onChange} />
      <section className={panel} aria-label='Operations'>
        <h3 className='mb-2 text-xs font-bold tracking-widest text-dg-subtle uppercase'>Operations</h3>
        <ol className='max-h-[70vh] space-y-1.5 overflow-y-auto pr-1'>
          {definition.nodes.map((node, position) => (
            <NodeRow key={node.id} {...props} node={node} position={position} />
          ))}
        </ol>
        <div className='mt-2'>
          <OperationSelect
            label='add operation'
            value=''
            onChange={(op) => op && onChange(addNode(definition, op, values))}
          />
        </div>
      </section>
    </div>
  );
}
