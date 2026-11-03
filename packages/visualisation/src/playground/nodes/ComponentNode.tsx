'use client';

/**
 * A node, drawn like a Grasshopper component: inputs on the left labelled by parameter, the result on the right, the
 * name of the cell it is (if any) on top. An unwired input holds a literal (persistent data), edited in place, or is
 * empty: a dashed chip, which sets a starting value when its type has one.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useRef, useState } from 'react';
import type { Expr } from '@dirty-geometry/vec2/recording/definition';
import { typeName } from '@dirty-geometry/vec2/schema/typing';
import { defaultLiteral } from '../defaults';
import type { GraphNode, Port, PortLiteral } from '../model/graph';
import { formatNumber } from '../model/print';

/** What a node can ask of the editor. */
export type NodeActions = {
  setLiteral: (key: string, port: string, value: Expr | undefined, coalesce?: boolean) => void;
  setValue: (key: string, value: Expr) => void;
  addItem: (key: string, rest: string) => void;
  name: (key: string, name: string) => void;
  output: (key: string, output: boolean) => void;
  enter: (fn: string) => void;
  /** Which cluster a list node (generate, map, filter, sort) calls. */
  setFn: (key: string, fn: string) => void;
  paramType: (key: string, type: string) => void;
  removeParam: (key: string) => void;
  /** A long press (or a right click): select the node and open its actions. */
  longPress: (key: string) => void;
};
export type ComponentData = {
  node: GraphNode;
  /** Problems on the node itself, and per port. */
  issues?: { node: string[]; ports: Map<string, string[]> };
  /** The node's value, in short (from the last run). */
  value?: string;
  /** Wired ports (their literal is not shown). */
  wired: ReadonlySet<string>;
  /** Whether the node can be named and made an output (it is in a cell, not in a cluster). */
  nameable: boolean;
  /** The definition's clusters (a list node picks the one it calls). */
  clusters?: readonly string[];
  /** The types a cluster param can have. */
  types?: readonly string[];
  /** Whether ports show their values (a viewer's setting; the selected node always does). */
  showValues?: boolean;
  /** The character of the button that opens a cluster. */
  openIcon?: string;
  actions?: NodeActions;
};
export type ComponentNodeType = Node<ComponentData, 'component'>;

const KIND_STYLE: Record<string, string> = {
  input: 'border-sky-400 bg-sky-50',
  param: 'border-sky-400 bg-sky-50',
  out: 'border-dg-navy-900 bg-dg-sky-100',
  call: 'border-violet-400 bg-violet-50',
  literal: 'border-amber-300 bg-amber-50',
  value: 'border-dg-border bg-white',
};
// On a touch screen the dots are bigger, and an invisible margin around them takes a finger that is close.
const handle =
  "!h-2.5 !w-2.5 !border-white !bg-dg-steel-600 coarse:!h-5 coarse:!w-5 coarse:before:absolute coarse:before:-inset-3 coarse:before:content-['']";
const chip = 'nodrag rounded border px-1 font-mono text-[10px] coarse:px-1.5 coarse:py-0.5 coarse:text-xs';

const literalText = (v: PortLiteral | undefined): string => {
  if (v === undefined) return '';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return `'${v}'`;
  if (v === null) return 'null';
  if (typeof v === 'object') return v.number;
  return String(v);
};

/** A number edited in place: applied while typing when it reads as a number. */
function NumberField({ value, label, onChange }: { value: number; label: string; onChange: (v: number) => void }) {
  const [text, setText] = useState(formatNumber(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(formatNumber(value));
  }
  return (
    <input
      aria-label={label}
      className={`${chip} w-14 border-dg-border bg-white text-dg-ink coarse:w-20`}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const n = Number(event.target.value);
        if (event.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

/** A literal on a port (or a value node's own), edited in place. */
function LiteralEditor({ value, label, onChange }: { value: PortLiteral; label: string; onChange: (v: Expr) => void }) {
  if (typeof value === 'number') return <NumberField value={value} label={label} onChange={onChange} />;
  if (typeof value === 'boolean')
    return (
      <button
        type='button'
        aria-label={label}
        className={`${chip} border-dg-border bg-white`}
        onClick={() => onChange(!value)}
      >
        {String(value)}
      </button>
    );
  return <span className={`${chip} border-dg-border bg-white text-dg-ink`}>{literalText(value)}</span>;
}

function PortRow({
  node,
  port,
  wired,
  issues,
  actions,
  showValues = true,
}: {
  node: GraphNode;
  port: Port;
  wired: boolean;
  issues?: string[];
  actions?: NodeActions;
  showValues?: boolean;
}) {
  const missing = !port.filled && !port.optional;
  const broken = port.unresolved !== undefined;
  const start = defaultLiteral(port.slot);
  const startable = start !== undefined && (typeof start !== 'object' || start === null);
  const label = `${node.label} ${port.label}`;
  return (
    <div
      className='relative flex items-center gap-1.5 py-0.5 pr-2 pl-3 coarse:py-1.5 coarse:pl-4'
      title={issues?.join('\n') ?? typeName(port.slot)}
    >
      <Handle
        type='target'
        position={Position.Left}
        id={port.key}
        className={`${handle} ${issues || broken ? '!bg-red-500' : ''}`}
      />
      <span className={`text-[10px] ${issues ? 'text-red-600' : 'text-dg-subtle'}`}>{port.label}</span>
      {showValues && !wired && port.filled && port.literal !== undefined && (
        <>
          <LiteralEditor
            value={port.literal}
            label={label}
            onChange={(v) => actions?.setLiteral(node.key, port.key, v, true)}
          />
          {port.optional && actions && (
            <button
              type='button'
              aria-label={`clear ${label}`}
              className='nodrag text-[10px] text-dg-subtle hover:text-red-600'
              onClick={() => actions.setLiteral(node.key, port.key, undefined)}
            >
              ×
            </button>
          )}
        </>
      )}
      {broken && <span className='font-mono text-[10px] text-red-600'>?{port.unresolved}</span>}
      {!port.filled && (missing || showValues) && (
        <button
          type='button'
          disabled={!startable || !actions}
          title={startable ? 'set a value (or wire one in)' : 'wire a value in'}
          aria-label={`set ${label}`}
          className={`${chip} border-dashed ${missing ? 'border-red-300 bg-red-50 text-red-600' : 'border-dg-border text-dg-subtle'} ${startable ? 'hover:border-dg-steel-600' : ''}`}
          onClick={() => startable && actions?.setLiteral(node.key, port.key, start)}
        >
          {missing ? 'missing' : 'none'}
        </button>
      )}
    </div>
  );
}

/** The node's name: a cell's, renamed in place; an anonymous node gets one (and becomes a cell). */
function NameEditor({ node, actions }: { node: GraphNode; actions: NodeActions }) {
  const current = node.cell?.name ?? (node.kind === 'input' || node.kind === 'param' ? node.name! : '');
  const [editing, setEditing] = useState<string | null>(null);
  if (editing !== null)
    return (
      <input
        autoFocus
        aria-label={`name ${node.label}`}
        className='nodrag w-24 rounded border border-dg-border bg-white px-1 font-mono text-[10px] text-dg-ink coarse:w-32'
        value={editing}
        onChange={(event) => setEditing(event.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditing(null);
          if (event.key === 'Enter') {
            if (editing && editing !== current) actions.name(node.key, editing);
            setEditing(null);
          }
        }}
      />
    );
  return (
    <button
      type='button'
      title={current ? 'rename' : 'name this node (it becomes a cell)'}
      aria-label={current ? `rename ${current}` : `name ${node.label}`}
      className='nodrag font-semibold hover:underline'
      onClick={() => setEditing(current)}
    >
      {current || '+ name'}
    </button>
  );
}

export const ComponentNode = memo(function ComponentNode({ data, selected }: NodeProps<ComponentNodeType>) {
  const { node, issues, value, wired, actions, showValues = true } = data;
  // A long press (no movement for a moment) opens the node's actions; a right click does the same.
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const bad = !!issues && (issues.node.length > 0 || issues.ports.size > 0);
  const style = KIND_STYLE[node.kind] ?? 'border-dg-border bg-white';
  const enter = node.kind === 'call' ? node.label : node.fn;
  const rests = [...new Set(node.inputs.map((p) => p.restOf).filter((r): r is string => !!r))];
  const named = !!node.cell;
  return (
    <div
      className={`group min-w-[140px] rounded-md border text-xs shadow-sm select-none [-webkit-touch-callout:none] ${style} ${bad ? '!border-red-400' : ''} ${selected ? 'ring-2 ring-dg-steel-600' : ''}`}
      title={issues?.node.join('\n') || undefined}
      onPointerDown={(event) => {
        cancel();
        const { clientX: x, clientY: y } = event;
        press.current = { timer: setTimeout(() => actions?.longPress(node.key), 450), x, y };
      }}
      onPointerMove={(event) => {
        const p = press.current;
        if (p && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 8) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        event.preventDefault();
        cancel();
        actions?.longPress(node.key);
      }}
    >
      {named && (
        <div className='flex items-center gap-1 rounded-t-md bg-dg-navy-900 px-2 py-0.5 font-mono text-[10px] text-dg-sky-200'>
          <span className='font-semibold'>{node.cell!.name}</span>
          {node.cell!.output && <span className='rounded bg-dg-sky-200 px-1 text-dg-navy-900'>out</span>}
          {node.cell!.type && <span className='ml-auto opacity-75'>{node.cell!.type}</span>}
        </div>
      )}
      <div className='flex items-center gap-1 border-b border-dg-border/60 px-2 py-1' title={node.detail}>
        {node.kind === 'param' && actions ? (
          <>
            <span className='font-mono text-dg-ink'>
              <NameEditor node={node} actions={actions} />
            </span>
            <select
              aria-label={`type of ${node.name}`}
              className='nodrag rounded border border-dg-border bg-white px-0.5 font-mono text-[10px]'
              value={node.type}
              onChange={(event) => actions.paramType(node.key, event.target.value)}
            >
              {[...new Set([node.type!, ...(data.types ?? [])])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button
              type='button'
              aria-label={`remove param ${node.name}`}
              title='remove this param (its uses get a default value)'
              className='nodrag ml-auto text-[10px] text-dg-subtle hover:text-red-600'
              onClick={() => actions.removeParam(node.key)}
            >
              ×
            </button>
          </>
        ) : (
          <>
            <span className='font-mono font-semibold text-dg-ink'>{node.label}</span>
            {(node.kind === 'input' || node.kind === 'param') && (
              <span className='font-mono text-[10px] text-dg-subtle'>: {node.type}</span>
            )}
          </>
        )}
        {node.fn &&
          (actions ? (
            <select
              aria-label={`cluster ${node.label} calls`}
              title='the cluster it calls'
              className='nodrag max-w-28 rounded border border-violet-300 bg-white px-0.5 font-mono text-[10px] text-violet-700 coarse:max-w-36'
              value={node.fn}
              onChange={(event) => actions.setFn(node.key, event.target.value)}
            >
              {!data.clusters?.includes(node.fn) && <option value={node.fn}>{node.fn}?</option>}
              {data.clusters?.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          ) : (
            <span className='font-mono text-[10px] text-violet-700'>({node.fn})</span>
          ))}
        {enter && actions && (
          <button
            type='button'
            title={`open the cluster ${enter}`}
            aria-label={`open cluster ${enter}`}
            className='nodrag ml-auto rounded px-1 text-[10px] text-violet-700 hover:bg-violet-100'
            onClick={() => actions.enter(enter)}
          >
            {data.openIcon ?? '⤢'}
          </button>
        )}
      </div>
      <div className='py-0.5'>
        {node.inputs.map((port) => (
          <PortRow
            key={port.key}
            node={node}
            port={port}
            wired={wired.has(port.key)}
            issues={issues?.ports.get(port.key)}
            actions={actions}
            showValues={showValues}
          />
        ))}
        {actions &&
          rests.map((rest) => (
            <button
              key={rest}
              type='button'
              aria-label={`add ${rest} to ${node.label}`}
              className='nodrag ml-3 rounded border border-dashed border-dg-border px-1 text-[10px] text-dg-subtle hover:border-dg-steel-600'
              onClick={() => actions.addItem(node.key, rest)}
            >
              + {rest}
            </button>
          ))}
        {node.kind === 'literal' && (
          <div className='px-2 py-0.5'>
            {actions ? (
              <LiteralEditor
                value={node.expr as PortLiteral}
                label={`${node.cell?.name ?? 'value'} value`}
                onChange={(v) => actions.setValue(node.key, v)}
              />
            ) : (
              <span className='font-mono text-[11px] text-dg-ink'>{literalText(node.expr as PortLiteral)}</span>
            )}
          </div>
        )}
      </div>
      {value !== undefined && (
        <div
          className='truncate border-t border-dg-border/60 px-2 py-0.5 font-mono text-[10px] text-dg-subtle'
          title={value}
        >
          → {value}
        </div>
      )}
      {node.kind !== 'out' && (
        <Handle type='source' position={Position.Right} id='out' className={`${handle} !top-[22px]`} />
      )}
    </div>
  );
});
