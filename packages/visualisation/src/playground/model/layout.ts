/**
 * Where the node view puts its nodes. Positions are the node view's own: they never enter the definition, and travel
 * in a part of the link of their own. They are stored one per node in graph order (no keys), so they only fit the
 * definition they were written with; a layout that does not fit is dropped, and nodes without a position are placed
 * automatically.
 */
import { array, densing, int, object, optional, schema, undensing } from 'densing';
import type { Canvas, Graph, GraphNode } from './graph';

export type Point = { x: number; y: number };
/** Positions by node key. */
export type Layout = Readonly<Record<string, Point>>;

/** Positions are kept on this grid (in pixels of the node view at zoom 1). */
export const GRID = 10;
const MAX = 4095;
const layoutSchema = schema(
  int('version', 0, 15),
  array('nodes', 0, 4095, optional('p', object('p', int('x', 0, MAX), int('y', 0, MAX)))),
);

/** The layout for the link: `undefined` when no node has a position (the link stays as it was). */
export function encodeLayout(layout: Layout, graph: Graph): string | undefined {
  const placed = graph.nodes.map((n) => layout[n.key]);
  const points = placed.filter((p): p is Point => p !== undefined);
  if (!points.length) return undefined;
  // Shifted so the top left node is at 0, then on the grid.
  const x0 = Math.min(...points.map((p) => p.x));
  const y0 = Math.min(...points.map((p) => p.y));
  const cell = (v: number) => Math.min(MAX, Math.max(0, Math.round(v / GRID)));
  const nodes = placed.map((p) => (p ? { x: cell(p.x - x0), y: cell(p.y - y0) } : null));
  return densing(layoutSchema, { version: 1, nodes });
}

/** The layout a link carries, for `graph`; `{}` when it does not fit (another definition) or cannot be read. */
export function decodeLayout(text: string | undefined, graph: Graph): Layout {
  if (!text) return {};
  try {
    const data = undensing(layoutSchema, text) as { nodes: (Point | null)[] };
    if (data.nodes.length !== graph.nodes.length) return {};
    const layout: Record<string, Point> = {};
    data.nodes.forEach((p, i) => {
      if (p) layout[graph.nodes[i]!.key] = { x: p.x * GRID, y: p.y * GRID };
    });
    return layout;
  } catch {
    return {};
  }
}

/** A node's height in the node view, for stacking: a cell's name bar, a header, a row per port, a value line. */
export const nodeHeight = (node: GraphNode) => (node.cell ? 20 : 0) + 30 + 22 * Math.max(1, node.inputs.length) + 22;
export const COLUMN = 260;
const GAP = 24;

/**
 * Positions for every node on `canvas`: stored ones are kept; the others go in columns by how many steps they are
 * from a node with no inputs (left to right, as data flows), below the stored ones.
 */
export function autoLayout(graph: Graph, layout: Layout, canvas: Canvas): Record<string, Point> {
  const nodes = graph.nodes.filter((n) => n.canvas === canvas);
  const inputsOf = new Map<string, string[]>();
  for (const edge of graph.edges) inputsOf.set(edge.target, [...(inputsOf.get(edge.target) ?? []), edge.source]);
  const depth = new Map<string, number>();
  const depthOf = (key: string, seen = new Set<string>()): number => {
    if (depth.has(key)) return depth.get(key)!;
    if (seen.has(key)) return 0;
    seen.add(key);
    const d = Math.max(-1, ...(inputsOf.get(key) ?? []).map((source) => depthOf(source, seen))) + 1;
    depth.set(key, d);
    return d;
  };
  const out: Record<string, Point> = {};
  const stored = nodes.filter((n) => layout[n.key]);
  for (const n of stored) out[n.key] = layout[n.key]!;
  const top = stored.length ? Math.max(...stored.map((n) => layout[n.key]!.y + nodeHeight(n))) + 80 : 0;
  const left = stored.length ? Math.min(...stored.map((n) => layout[n.key]!.x)) : 0;
  const columns = new Map<number, number>();
  for (const n of nodes) {
    if (out[n.key]) continue;
    const d = depthOf(n.key);
    const y = columns.get(d) ?? top;
    out[n.key] = { x: left + d * COLUMN, y };
    columns.set(d, y + nodeHeight(n) + GAP);
  }
  return out;
}

/**
 * The layout with keys starting `from` moved to start `to` instead (`c:a` → `c:b`, `c:a@args.x` → `c:b@args.x`),
 * for edits that move a node (renaming a cell, naming an anonymous node, inlining a cell).
 */
export function remapLayout(layout: Layout, from: string, to: string): Layout {
  const out: Record<string, Point> = {};
  for (const [key, point] of Object.entries(layout)) {
    const moves = key === from || key.startsWith(`${from}@`) || key.startsWith(`${from}.`);
    out[moves ? to + key.slice(from.length) : key] = point;
  }
  return out;
}
