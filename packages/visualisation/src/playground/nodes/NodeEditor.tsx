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
import { inputTypes, type Analysis } from '@dirty-geometry/vec2/schema/typing';
import { describeValue } from '../describe';
import { issuesByNode, type Canvas, type Graph } from '../model/graph';
import * as edits from '../model/graph-edits';
import { autoLayout, type Layout } from '../model/layout';
import { isDoubleTap, selectionActions, type Tap } from '../model/selection';
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
  /** The search: where it opened, and the input a new node goes into (a wire dragged onto the empty canvas). */
  const [palette, setPalette] = useState<{
    screen: { x: number; y: number };
    flow: { x: number; y: number };
    into?: { node: string; port: string };
  } | null>(null);
  /** The nodes selected together (a box, Shift or Ctrl), and the selected wire. */
  const [picked, setPicked] = useState<string[]>([]);
  const [edge, setEdge] = useState<string | null>(null);
  /** Dragging on the canvas draws a selection box instead of panning (for a finger: no Shift key). */
  const [boxSelect, setBoxSelect] = useState(false);
  const lastTap = useRef<Tap | null>(null);
  const openPalette = (clientX: number, clientY: number, into?: { node: string; port: string }) => {
    const rect = box.current!.getBoundingClientRect();
    setPalette({
      // Kept inside the canvas, also on a narrow phone.
      screen: {
        x: Math.max(4, Math.min(clientX - rect.left, rect.width - 296)),
        y: Math.max(4, Math.min(clientY - rect.top, rect.height - 300)),
      },
      flow: flow.screenToFlowPosition({ x: clientX, y: clientY }),
      ...(into && { into }),
    });
  };
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
      name: (key, name) =>
        edit((doc) => {
          const param = /^f:(.+)#(.+)$/.exec(key);
          return param ? edits.renameClusterParam(doc, param[1]!, param[2]!, name) : edits.nameNode(doc, key, name);
        }),
      paramType: (key, type) => {
        const [, fn, param] = /^f:(.+)#(.+)$/.exec(key)!;
        edit((doc) => edits.setClusterParamType(doc, fn!, param!, type));
      },
      removeParam: (key) => {
        const [, fn, param] = /^f:(.+)#(.+)$/.exec(key)!;
        edit((doc) => edits.removeClusterParam(doc, fn!, param!));
      },
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
    if ('input' in entry && canvas !== 'main') return setError('A cluster sees only its params: add one with + param');
    edit((doc) => {
      // The nodes stay where they are drawn: placing one fixes the others too.
      doc = { ...doc, layout: { ...positions, ...doc.layout } };
      if (palette!.into) {
        const { node, port } = palette!.into;
        if ('input' in entry) {
          const added = edits.addInputNode(doc, entry.input, at);
          return edits.connect(added, added.key, node, port);
        }
        return edits.insertNode(doc, node, port, entry.expr, at);
      }
      const added = 'input' in entry ? edits.addInputNode(doc, entry.input, at) : edits.addNode(doc, entry.expr, at);
      onSelect(added.key);
      return added;
    });
  };

  // On a touch screen a whole graph squeezed onto a phone cannot be read or tapped: fit no further out than 0.6, and pan.
  const fitMinZoom = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 0.6 : 0.2),
    [],
  );
  // Fit the view when another canvas opens (only then: the React Flow instance is a new object on every render).
  const fit = useRef(flow.fitView);
  fit.current = flow.fitView;
  useEffect(() => {
    const timer = setTimeout(() => fit.current({ padding: 0.15, duration: 200, minZoom: fitMinZoom }), 30);
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
  /** The selection the toolbar acts on: several picked nodes, else the selected node, else a wire. */
  const keys = picked.length > 1 ? picked : selected ? [selected] : picked;
  const selection = selectionActions(graph, keys, edge);
  const deleteSelection = () => {
    if (selection.kind === 'edge') {
      const e = graph.edges.find((x) => x.id === edge);
      if (e) edit((doc) => edits.disconnect(doc, e.target, e.port));
      setEdge(null);
      return;
    }
    onDelete({ nodes: keys.map((id) => ({ id })), edges: [] });
    setPicked([]);
    onSelect(null);
  };
  /** + add: in the middle of the canvas; in a cluster, into the selected node's first empty input. */
  const addFromToolbar = () => {
    const rect = box.current!.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 140;
    const y = rect.top + 24;
    if (canvas === 'main') return openPalette(x, y);
    const node = selection.node;
    const port = node?.inputs.find((p) => !p.filled) ?? node?.inputs.find((p) => p.literal !== undefined);
    if (!node || !port)
      return setError('In a cluster a node goes into an input: select a node with an empty input, or drag from one');
    openPalette(x, y, { node: node.key, port: port.key });
  };
  const paramTypes = useMemo(() => inputTypes(), []);
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
            types: paramTypes,
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
    <div className='flex h-[60vh] min-h-[420px] flex-col border border-dg-border bg-white sm:h-[70vh] sm:min-h-[480px]'>
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
        <button
          type='button'
          className={tool}
          aria-label='add a node'
          title='Search for a node to add (or double-click / double-tap the canvas)'
          onClick={addFromToolbar}
        >
          + add
        </button>
        <button
          type='button'
          aria-pressed={boxSelect}
          className={`${tool} ${boxSelect ? '!border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200' : ''}`}
          title='Drag to select several nodes (instead of moving the canvas); Shift-drag does the same'
          onClick={() => setBoxSelect((on) => !on)}
        >
          select
        </button>
        {canvas !== 'main' && (
          <ClusterTools fn={canvas.slice(3)} edit={edit} onLeave={() => setCanvas('main')} onRenamed={enter} />
        )}
        {functions.length > 0 && (
          <label className='ml-auto flex min-w-0 items-center gap-1 text-dg-subtle'>
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
      <SelectionBar
        actions={selection}
        value={selection.node?.cell ? valueText(evaluation, selection.node.cell.name) : undefined}
        issues={selection.node ? issueList(issues.get(selection.node.key)) : []}
        count={keys.length}
        onDelete={deleteSelection}
        onName={(name) => actions.name(selection.node!.key, name)}
        onOutput={() => actions.output(selection.node!.key, !selection.node!.cell?.output)}
        onOpen={() => enter(selection.open!)}
        onCluster={() =>
          edit((doc) => {
            const made = edits.makeCluster(doc, keys);
            setPicked([]);
            return made;
          })
        }
      />
      <div ref={box} className='relative min-h-0 flex-1'>
        {error && (
          <div className='absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700'>
            {error}
            <button type='button' className='ml-auto underline' onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}
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
            // A double click on the canvas opens the search (in a cluster, nodes grow from its ports).
            const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
            const twice = event.detail >= 2 || isDoubleTap(lastTap.current, tap);
            lastTap.current = twice ? null : tap;
            if (twice) {
              if (canvas === 'main') openPalette(event.clientX, event.clientY);
              else setError('A cluster is one expression: drag a wire from an input into space to add a node there');
            }
          }}
          onConnect={onConnect}
          onConnectEnd={(event, state) => {
            // A wire dragged from an input onto the empty canvas: search for the node to put there.
            if (state.isValid || state.toHandle || state.fromHandle?.type !== 'target' || !state.fromNode) return;
            const point = 'changedTouches' in event ? event.changedTouches[0]! : (event as MouseEvent);
            openPalette(point.clientX, point.clientY, { node: state.fromNode.id, port: state.fromHandle.id ?? '' });
          }}
          onSelectionChange={({ nodes: now, edges: wires }) => {
            const next = now.map((n) => n.id);
            setPicked((current) => (current.join() === next.join() ? current : next));
            setEdge(wires.length === 1 && !now.length ? wires[0]!.id : null);
          }}
          onEdgeClick={(_, e) => {
            onSelect(null);
            setEdge(e.id);
          }}
          selectionOnDrag={boxSelect}
          panOnDrag={!boxSelect}
          connectionRadius={30}
          isValidConnection={isValidConnection}
          onDelete={onDelete}
          deleteKeyCode={['Delete', 'Backspace']}
          zoomOnDoubleClick={false}
          minZoom={0.2}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: fitMinZoom }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Lines} gap={20} color='#eef1f5' />
          <MiniMap pannable zoomable className='!hidden !bg-dg-sky-100 sm:!block' />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

const issueList = (issues?: { node: string[]; ports: Map<string, string[]> }) =>
  issues ? [...issues.node, ...[...issues.ports.values()].flat()] : [];

/** What can be done with the selection, as buttons (a finger has no Delete key and no hover). */
function SelectionBar({
  actions,
  value,
  issues,
  count,
  onDelete,
  onName,
  onOutput,
  onOpen,
  onCluster,
}: {
  actions: ReturnType<typeof selectionActions>;
  value?: string;
  issues: string[];
  count: number;
  onDelete: () => void;
  onName: (name: string) => void;
  onOutput: () => void;
  onOpen: () => void;
  onCluster: () => void;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const node = actions.node;
  const key = node?.key;
  const [prev, setPrev] = useState(key);
  if (prev !== key) {
    setPrev(key);
    setNaming(null);
  }
  // One height whatever it shows, so selecting something never moves the canvas under the finger.
  const strip =
    'flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-dg-border px-2 text-xs whitespace-nowrap';
  if (actions.kind === 'none')
    return (
      <p className={`${strip} text-[11px] text-dg-subtle`}>
        <span className='coarse:hidden'>
          double-click to add · drag a result onto an input · drag from an input into space to add into it · Shift-drag
          or <span className='font-semibold'>select</span> to pick several · Delete removes
        </span>
        <span className='hidden coarse:inline'>
          tap a node to act on it · tap a dot, then another, to wire · double-tap or + add to add
        </span>
      </p>
    );
  const current = node?.cell?.name ?? (node?.kind === 'input' || node?.kind === 'param' ? node.name : '');
  return (
    <div className={`${strip} bg-dg-sky-100/40`}>
      <span className='font-mono text-dg-ink'>
        {actions.kind === 'edge' ? 'wire' : actions.kind === 'nodes' ? `${count} nodes` : current || node?.label}
      </span>
      {value && <span className='max-w-[12rem] truncate font-mono text-[11px] text-dg-subtle'>→ {value}</span>}
      {actions.open && (
        <button type='button' className={tool} onClick={onOpen}>
          open {actions.open}
        </button>
      )}
      {actions.canName &&
        (naming === null ? (
          <button type='button' className={tool} onClick={() => setNaming(current ?? '')}>
            {current ? 'rename' : 'name'}
          </button>
        ) : (
          <input
            autoFocus
            aria-label='node name'
            className='w-28 rounded border border-dg-border px-1 py-0.5 font-mono text-xs'
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onBlur={() => setNaming(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNaming(null);
              if (event.key === 'Enter') {
                if (naming && naming !== current) onName(naming);
                setNaming(null);
              }
            }}
          />
        ))}
      {actions.canOutput && (
        <button type='button' aria-pressed={!!node?.cell?.output} className={tool} onClick={onOutput}>
          {node?.cell?.output ? 'output ✓' : 'output'}
        </button>
      )}
      {actions.canCluster && (
        <button type='button' className={tool} onClick={onCluster} title='Wires coming in become its params'>
          make cluster
        </button>
      )}
      {actions.canDelete && (
        <button type='button' className={`${tool} hover:!border-red-400 hover:!text-red-600`} onClick={onDelete}>
          {actions.kind === 'edge' ? 'remove wire' : 'delete'}
        </button>
      )}
      {issues.length > 0 && (
        <span className='text-[11px] text-red-600' title={issues.join('\n')}>
          {issues.join(' · ')}
        </span>
      )}
    </div>
  );
}

const tool =
  'rounded border border-dg-border bg-white px-1.5 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 coarse:px-2.5 coarse:py-1.5';

/** A cluster's own tools: rename it, add a param, dissolve it back into its callers. */
function ClusterTools({
  fn,
  edit,
  onLeave,
  onRenamed,
}: {
  fn: string;
  edit: (f: (doc: edits.GraphDoc) => edits.GraphDoc) => void;
  onLeave: () => void;
  onRenamed: (fn: string) => void;
}) {
  const [name, setName] = useState(fn);
  const [type, setType] = useState('Coordinate');
  const [prev, setPrev] = useState(fn);
  if (prev !== fn) {
    setPrev(fn);
    setName(fn);
  }
  const types = useMemo(() => inputTypes(), []);
  return (
    <span className='flex items-center gap-1'>
      <input
        aria-label='cluster name'
        className='w-24 rounded border border-dg-border px-1 py-0.5 font-mono text-xs'
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || name === fn) return;
          edit((doc) => edits.renameCluster(doc, fn, name));
          onRenamed(name);
        }}
      />
      <select
        aria-label='new param type'
        className='rounded border border-dg-border bg-white px-1 py-0.5 text-xs'
        value={type}
        onChange={(event) => setType(event.target.value)}
      >
        {types.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <button type='button' className={tool} onClick={() => edit((doc) => edits.addClusterParam(doc, fn, type))}>
        + param
      </button>
      <button
        type='button'
        className={tool}
        title='Put the body back where the cluster is called, and remove the cluster'
        onClick={() => {
          edit((doc) => edits.dissolveCluster(doc, fn));
          onLeave();
        }}
      >
        dissolve
      </button>
    </span>
  );
}

const toGraphHas = (doc: edits.GraphDoc, key: string) => {
  const cells = doc.definition.cells.map((c) => c.name);
  const inputs = doc.definition.inputs.map((i) => i.name);
  if (key.startsWith('i:')) return inputs.includes(key.slice(2));
  if (key.startsWith('c:')) return cells.includes(key.slice(2).split('@')[0]!);
  return true;
};
