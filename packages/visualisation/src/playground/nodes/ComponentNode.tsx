'use client';

/**
 * A node, drawn like a Grasshopper component: inputs on the left labelled by parameter, the result on the right, the
 * name of the cell it is (if any) on top. An unwired input shows the literal it holds (persistent data), or a dashed
 * chip when it is empty.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { typeName } from '@dirty-geometry/vec2/schema/typing';
import type { GraphNode, Port } from '../model/graph';
import { formatNumber } from '../model/print';

export type ComponentData = {
  node: GraphNode;
  /** Problems on the node itself, and per port. */
  issues?: { node: string[]; ports: Map<string, string[]> };
  /** The node's value, in short (from the last run). */
  value?: string;
  /** Wired ports (their literal is not shown). */
  wired: ReadonlySet<string>;
  onEnter?: (fn: string) => void;
};
export type ComponentNodeType = Node<ComponentData, 'component'>;

const KIND_STYLE: Record<string, string> = {
  input: 'border-sky-400 bg-sky-50',
  param: 'border-sky-400 bg-sky-50',
  out: 'border-dg-navy-900 bg-dg-sky-100',
  call: 'border-violet-400 bg-violet-50',
  literal: 'border-dg-border bg-white',
  value: 'border-dg-border bg-white',
};
const handle = '!h-2.5 !w-2.5 !border-white !bg-dg-steel-600';

const literalText = (port: Port): string => {
  const v = port.literal;
  if (v === undefined) return '';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return `'${v}'`;
  if (v === null) return 'null';
  if (typeof v === 'object') return v.number;
  return String(v);
};

function PortRow({ port, wired, issues }: { port: Port; wired: boolean; issues?: string[] }) {
  const missing = !port.filled && !port.optional;
  const broken = port.unresolved !== undefined;
  return (
    <div
      className='relative flex items-center gap-1.5 py-0.5 pr-2 pl-3'
      title={issues?.join('\n') ?? typeName(port.slot)}
    >
      <Handle
        type='target'
        position={Position.Left}
        id={port.key}
        className={`${handle} ${issues || broken ? '!bg-red-500' : ''}`}
      />
      <span className={`text-[10px] ${issues ? 'text-red-600' : 'text-dg-subtle'}`}>{port.label}</span>
      {!wired && port.filled && port.literal !== undefined && (
        <span className='rounded border border-dg-border bg-white px-1 font-mono text-[10px] text-dg-ink'>
          {literalText(port)}
        </span>
      )}
      {broken && <span className='font-mono text-[10px] text-red-600'>?{port.unresolved}</span>}
      {!port.filled && (
        <span
          className={`rounded border border-dashed px-1 text-[10px] ${missing ? 'border-red-300 bg-red-50 text-red-600' : 'border-dg-border text-dg-subtle'}`}
        >
          {missing ? 'missing' : 'none'}
        </span>
      )}
    </div>
  );
}

export const ComponentNode = memo(function ComponentNode({ data, selected }: NodeProps<ComponentNodeType>) {
  const { node, issues, value, wired } = data;
  const bad = !!issues && (issues.node.length > 0 || issues.ports.size > 0);
  const style = KIND_STYLE[node.kind] ?? 'border-dg-border bg-white';
  const enter = node.kind === 'call' ? node.label : node.fn;
  return (
    <div
      className={`min-w-[140px] rounded-md border text-xs shadow-sm ${style} ${bad ? '!border-red-400' : ''} ${selected ? 'ring-2 ring-dg-steel-600' : ''}`}
      title={issues?.node.join('\n') || undefined}
    >
      {node.cell && (
        <div className='flex items-center gap-1 rounded-t-md bg-dg-navy-900 px-2 py-0.5 font-mono text-[10px] text-dg-sky-200'>
          <span className='font-semibold'>{node.cell.name}</span>
          {node.cell.output && <span className='rounded bg-dg-sky-200 px-1 text-dg-navy-900'>out</span>}
          {node.cell.type && <span className='ml-auto opacity-75'>{node.cell.type}</span>}
        </div>
      )}
      <div className='flex items-center gap-1 border-b border-dg-border/60 px-2 py-1' title={node.detail}>
        <span className='font-mono font-semibold text-dg-ink'>{node.label}</span>
        {(node.kind === 'input' || node.kind === 'param') && (
          <span className='font-mono text-[10px] text-dg-subtle'>: {node.type}</span>
        )}
        {node.fn && <span className='font-mono text-[10px] text-violet-700'>({node.fn})</span>}
        {enter && data.onEnter && (
          <button
            type='button'
            title={`open the cluster ${enter}`}
            aria-label={`open cluster ${enter}`}
            className='nodrag ml-auto rounded px-1 text-[10px] text-violet-700 hover:bg-violet-100'
            onClick={() => data.onEnter!(enter)}
          >
            ⤢
          </button>
        )}
      </div>
      <div className='py-0.5'>
        {node.inputs.map((port) => (
          <PortRow key={port.key} port={port} wired={wired.has(port.key)} issues={issues?.ports.get(port.key)} />
        ))}
        {node.kind === 'literal' && (
          <div className='px-2 py-0.5 font-mono text-[11px] text-dg-ink'>{JSON.stringify(node.expr)}</div>
        )}
      </div>
      {value !== undefined && (
        <div className='truncate border-t border-dg-border/60 px-2 py-0.5 font-mono text-[10px] text-dg-subtle'>
          → {value}
        </div>
      )}
      {node.kind !== 'out' && (
        <Handle type='source' position={Position.Right} id='out' className={`${handle} !top-[22px]`} />
      )}
    </div>
  );
});
