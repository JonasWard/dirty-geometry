'use client';

/**
 * The node view: the definition as a graph on a canvas, Grasshopper style. Functions are clusters: open one (⤢ on
 * its node, a double click, or the cluster list) to see its params and body on a canvas of its own.
 *
 * The graph is drawn from the definition on every change; only positions belong to the node view, kept in the
 * document's `layout` (and the link). Every edit here is an edit of the definition (model/graph-edits.ts), one undo
 * step each, a drag included. Double-click the canvas to add a node; drag from a result to an input to wire it
 * (only where the types fit); Delete removes the selected nodes and wires.
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
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import type { Analysis } from '@dirty-geometry/vec2/schema/typing';
import { describeValue } from '../describe';
import { issuesByNode, type Canvas, type Graph } from '../model/graph';
import * as edits from '../model/graph-edits';
import { autoLayout, type Layout } from '../model/layout';
import { useStoreApi, type CommitOptions } from '../store';
import { ComponentNode, type ComponentNodeType, type NodeActions } from './ComponentNode';
import { Palette, type PaletteEntry } from './Palette';

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
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<{ screen: { x: number; y: number }; flow: { x: number; y: number } } | null>(
    null,
  );
  const box = useRef<HTMLDivElement>(null);
  /** Applies an edit of the definition and the layout; a refused one shows why. */
  const edit = useCallback(
    (f: (doc: edits.GraphDoc) => edits.GraphDoc, options?: CommitOptions) => {
      const state = store.getState();
      try {
        const next = f({ definition: state.definition, layout: state.layout ?? {} });
        state.update({ definition: next.definition, layout: next.layout }, options);
        setError(null);
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [store],
  );
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
  const actions = useMemo(
    (): NodeActions => ({
      setLiteral: (key, port, value, coalesce) =>
        edit((doc) => edits.setPortLiteral(doc, key, port, value), coalesce ? { coalesce: `${key}:${port}` } : {}),
      setValue: (key, value) => edit((doc) => edits.setNodeLiteral(doc, key, value), { coalesce: `${key}:value` }),
      addItem: (key, rest) => edit((doc) => edits.addRestItem(doc, key, rest)),
      name: (key, name) => edit((doc) => edits.nameNode(doc, key, name)),
      output: (key, output) => edit((doc) => edits.setOutput(doc, key, output)),
      enter,
    }),
    [edit, enter],
  );
  const onConnect = useCallback(
    (c: Connection) => edit((doc) => edits.connect(doc, c.source, c.target, c.targetHandle ?? '')),
    [edit],
  );
  const isValidConnection = useCallback(
    (c: Connection | Edge) =>
      !edits.connectProblem(
        { definition, layout },
        analysis,
        graph,
        c.source,
        c.target,
        (c as Connection).targetHandle ?? '',
      ),
    [definition, layout, analysis, graph],
  );
  const onDelete = useCallback(
    ({ nodes: gone, edges: cut }: { nodes: { id: string }[]; edges: Edge[] }) =>
      edit((doc) => {
        const removed = new Set(gone.map((n) => n.id));
        // Wires first (those of deleted nodes go with them), then the nodes, deepest first.
        for (const e of cut)
          if (!removed.has(e.target) && !removed.has(e.source))
            doc = edits.disconnect(doc, e.target, e.targetHandle ?? '');
        for (const key of [...removed].sort((a, b) => b.length - a.length))
          if (toGraphHas(doc, key)) doc = edits.deleteNode(doc, key);
        return doc;
      }),
    [edit],
  );
  const pick = (entry: PaletteEntry) => {
    const at = palette!.flow;
    setPalette(null);
    edit((doc) => {
      // The nodes stay where they are drawn: placing one fixes the others too.
      doc = { ...doc, layout: { ...positions, ...doc.layout } };
      const added = 'input' in entry ? edits.addInputNode(doc, entry.input, at) : edits.addNode(doc, entry.expr, at);
      onSelect(added.key);
      return added;
    });
  };

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
            nameable: canvas === 'main' && node.kind !== 'input',
            actions,
          },
        };
      });
  }, [graph, canvas, positions, issues, evaluation, selected, actions]);
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
        <span className='text-dg-subtle'>
          {canvas === 'main'
            ? 'double-click the canvas to add · drag a result onto an input to wire · Delete removes'
            : 'a cluster: its params on the left, its result on the right'}
        </span>
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
      {error && (
        <div className='flex items-center gap-2 border-b border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700'>
          {error}
          <button type='button' className='ml-auto underline' onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}
      <div ref={box} className='relative min-h-0 flex-1'>
        {palette && (
          <Palette definition={definition} at={palette.screen} onPick={pick} onClose={() => setPalette(null)} />
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(event, node) => click(event, node.id)}
          onPaneClick={(event) => {
            onSelect(null);
            // A double click on the canvas opens the search (main canvas: a cluster's body grows from its ports).
            if (event.detail >= 2 && canvas === 'main') {
              const rect = box.current!.getBoundingClientRect();
              setPalette({
                screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
                flow: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              });
            }
          }}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onDelete={onDelete}
          deleteKeyCode={['Delete', 'Backspace']}
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

const toGraphHas = (doc: edits.GraphDoc, key: string) => {
  const cells = doc.definition.cells.map((c) => c.name);
  const inputs = doc.definition.inputs.map((i) => i.name);
  if (key.startsWith('i:')) return inputs.includes(key.slice(2));
  if (key.startsWith('c:')) return cells.includes(key.slice(2).split('@')[0]!);
  return true;
};
