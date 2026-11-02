'use client';

/**
 * The node view: the definition as a graph on a canvas, Grasshopper style. Functions are clusters: open one (⤢ on
 * its node, a double click, or the cluster list) to see its params and body on a canvas of its own.
 *
 * The graph is drawn from the definition on every change; only positions belong to the node view, kept in the
 * document's `layout` (and the link). A drag is one undo step.
 */
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import type { Analysis } from '@dirty-geometry/vec2/schema/typing';
import { describeValue } from '../describe';
import { issuesByNode, type Canvas, type Graph } from '../model/graph';
import { autoLayout, type Layout } from '../model/layout';
import { useStoreApi } from '../store';
import { ComponentNode, type ComponentNodeType } from './ComponentNode';

const nodeTypes = { component: ComponentNode };

export type NodeEditorProps = {
  definition: Definition;
  graph: Graph;
  layout: Layout;
  analysis: Analysis;
  evaluation: Evaluation;
  /** The selected node's key (its value is drawn). */
  selected: string | null;
  onSelect: (key: string | null) => void;
};

export function NodeEditor(props: NodeEditorProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function valueText(evaluation: Evaluation, name: string): string | undefined {
  const result = evaluation.cells.get(name);
  if (result) return 'error' in result ? `error: ${result.error}` : describeValue(result.value);
  return evaluation.inputs.has(name) ? describeValue(evaluation.inputs.get(name)) : undefined;
}

function Canvas({ definition, graph, layout, analysis, evaluation, selected, onSelect }: NodeEditorProps) {
  const store = useStoreApi();
  const flow = useReactFlow();
  const [canvas, setCanvas] = useState<Canvas>('main');
  const functions = definition.functions.map((fn) => fn.name);
  // A cluster that is gone (renamed, removed) closes.
  useEffect(() => {
    if (canvas !== 'main' && !functions.includes(canvas.slice(3))) setCanvas('main');
  }, [canvas, functions]);
  const enter = useCallback(
    (fn: string) => {
      setCanvas(`fn:${fn}`);
      onSelect(null);
    },
    [onSelect],
  );
  // Fit the view when another canvas opens (only then: the React Flow instance is a new object on every render).
  const fit = useRef(flow.fitView);
  fit.current = flow.fitView;
  useEffect(() => {
    const timer = setTimeout(() => fit.current({ padding: 0.15, duration: 200 }), 30);
    return () => clearTimeout(timer);
  }, [canvas]);

  // A double click on a cluster opens it. The browser counts the clicks (`detail`): React Flow's own double click is
  // lost, as the first click selects the node and redraws it.
  const click = (event: React.MouseEvent, key: string) => {
    const n = graph.byKey.get(key);
    const fn = n?.kind === 'call' ? n.label : n?.fn;
    if (event.detail >= 2 && fn && functions.includes(fn)) return enter(fn);
    onSelect(key);
  };
  const issues = useMemo(() => issuesByNode(graph, analysis), [graph, analysis]);
  const positions = useMemo(() => autoLayout(graph, layout, canvas), [graph, layout, canvas]);
  const derived = useMemo((): ComponentNodeType[] => {
    const wired = new Map<string, Set<string>>();
    for (const e of graph.edges) wired.set(e.target, (wired.get(e.target) ?? new Set()).add(e.port));
    return graph.nodes
      .filter((n) => n.canvas === canvas)
      .map((node) => {
        const name = node.cell?.name ?? (node.kind === 'input' ? node.name : undefined);
        return {
          id: node.key,
          type: 'component',
          position: positions[node.key]!,
          selected: node.key === selected,
          data: {
            node,
            issues: issues.get(node.key),
            value: name === undefined ? undefined : valueText(evaluation, name),
            wired: wired.get(node.key) ?? new Set(),
            onEnter: enter,
          },
        };
      });
  }, [graph, canvas, positions, issues, evaluation, selected, enter]);
  // React Flow moves nodes while they are dragged; the layout is written when a drag ends.
  const [nodes, setNodes] = useState(derived);
  // Rebuilt nodes keep their measured size: React Flow hides a node until it is measured, and a hidden node misses
  // clicks (the second click of a double click).
  useEffect(
    () =>
      setNodes((current) => {
        const measured = new Map(current.map((n) => [n.id, n.measured]));
        return derived.map((n) => (measured.get(n.id) ? { ...n, measured: measured.get(n.id) } : n));
      }),
    [derived],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<ComponentNodeType>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  const onNodeDragStop = useCallback(
    (_: unknown, __: unknown, moved: ComponentNodeType[]) => {
      const next: Record<string, { x: number; y: number }> = { ...store.getState().layout };
      // Placing one node fixes the whole canvas where it is drawn, so nothing else jumps.
      for (const n of nodes) next[n.id] ??= n.position;
      for (const n of moved) next[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      store.getState().update({ layout: next }, { coalesce: 'layout' });
    },
    [nodes, store],
  );

  const edges = useMemo((): Edge[] => {
    const here = new Set(derived.map((n) => n.id));
    return graph.edges
      .filter((e) => here.has(e.source) && here.has(e.target))
      .map((e) => {
        const bad = !!issues.get(e.target)?.ports.get(e.port);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: 'out',
          targetHandle: e.port,
          style: { stroke: bad ? '#ef4444' : '#5b7a99', strokeWidth: 1.5 },
        };
      });
  }, [graph, derived, issues]);

  return (
    <div className='flex h-[70vh] min-h-[480px] flex-col border border-dg-border bg-white'>
      <div className='flex flex-wrap items-center gap-1 border-b border-dg-border px-2 py-1 text-xs'>
        <nav aria-label='cluster path' className='flex items-center gap-1'>
          <button
            type='button'
            className={canvas === 'main' ? 'font-semibold text-dg-ink' : 'text-dg-steel-600 hover:underline'}
            onClick={() => setCanvas('main')}
          >
            main
          </button>
          {canvas !== 'main' && (
            <>
              <span className='text-dg-subtle'>›</span>
              <span className='font-mono font-semibold text-violet-700'>{canvas.slice(3)}</span>
            </>
          )}
        </nav>
        {functions.length > 0 && (
          <label className='ml-auto flex items-center gap-1 text-dg-subtle'>
            clusters
            <select
              aria-label='open cluster'
              className='rounded border border-dg-border bg-white px-1 py-0.5 text-xs text-dg-ink'
              value={canvas === 'main' ? '' : canvas.slice(3)}
              onChange={(event) => (event.target.value ? enter(event.target.value) : setCanvas('main'))}
            >
              <option value=''>main</option>
              {functions.map((fn) => (
                <option key={fn} value={fn}>
                  {fn}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className='relative min-h-0 flex-1'>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(event, node) => click(event, node.id)}
          onPaneClick={() => onSelect(null)}
          nodesConnectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          minZoom={0.2}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Lines} gap={20} color='#eef1f5' />
          <MiniMap pannable zoomable className='!bg-dg-sky-100' />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
