/**
 * What the node view's toolbar offers for the current selection, so that everything the keyboard and the mouse can do
 * also works with a finger; and a double tap told apart from two taps.
 */
import type { Graph, GraphNode } from './graph';

export type SelectionActions = {
  /** Nothing, one node, several nodes, or one wire. */
  kind: 'none' | 'node' | 'nodes' | 'edge';
  node?: GraphNode;
  canDelete: boolean;
  /** Rename (a named node) or name (an anonymous one: it becomes a cell). */
  canName: boolean;
  canOutput: boolean;
  /** The cluster this node opens (a call, or a list form's function). */
  open?: string;
  canCluster: boolean;
};

const none: SelectionActions = { kind: 'none', canDelete: false, canName: false, canOutput: false, canCluster: false };

export function selectionActions(graph: Graph, keys: readonly string[], edge: string | null): SelectionActions {
  if (edge && !keys.length) return { ...none, kind: 'edge', canDelete: graph.edges.some((e) => e.id === edge) };
  const nodes = keys.map((k) => graph.byKey.get(k)).filter((n): n is GraphNode => !!n);
  const removable = (n: GraphNode) => n.kind !== 'param' && n.kind !== 'out';
  if (nodes.length > 1)
    return {
      ...none,
      kind: 'nodes',
      canDelete: nodes.every(removable),
      canCluster: nodes.every((n) => n.canvas === 'main') && nodes.some((n) => n.kind !== 'input'),
    };
  const node = nodes[0];
  if (!node) return none;
  const functions = new Set(graph.functions.map((f) => f.name));
  const fn = node.kind === 'call' ? node.label : node.fn;
  return {
    ...none,
    kind: 'node',
    node,
    canDelete: removable(node),
    canName: node.kind === 'input' || node.kind === 'param' || (node.canvas === 'main' && node.kind !== 'out'),
    canOutput: node.canvas === 'main' && node.kind !== 'input',
    // One node can be a cluster too (a function of what flows into it).
    canCluster: node.canvas === 'main' && node.kind !== 'input',
    ...(fn && functions.has(fn) && { open: fn }),
  };
}

/** A tap: when it happened (the event's own time stamp, so a slow redraw in between does not matter) and where. */
export type Tap = { time: number; x: number; y: number };
/** Whether `tap` follows `previous` closely enough, in time and place, to make a double tap. */
export const isDoubleTap = (previous: Tap | null, tap: Tap, ms = 400, px = 30) =>
  !!previous &&
  tap.time - previous.time >= 0 &&
  tap.time - previous.time <= ms &&
  Math.hypot(tap.x - previous.x, tap.y - previous.y) <= px;
