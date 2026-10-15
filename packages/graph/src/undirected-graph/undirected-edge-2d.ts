import type { UndirectedNode2D } from './undirected-node-2d';

/**
 * Undirected edge between two nodes.
 * Payload `T` is a record of JSON values and/or Geometry2 (or Geometry2 arrays).
 */
export class UndirectedEdge2D<T extends object = Record<string, never>> {
  constructor(
    public readonly id: string,
    public readonly a: UndirectedNode2D,
    public readonly b: UndirectedNode2D,
    public data: T,
  ) {}

  /** The endpoint that is not `node`. */
  other(node: UndirectedNode2D): UndirectedNode2D {
    if (node.id === this.a.id) return this.b;
    if (node.id === this.b.id) return this.a;
    throw new Error(`Node ${node.id} is not an endpoint of edge ${this.id}`);
  }

  hasEndpoint(node: UndirectedNode2D): boolean {
    return node.id === this.a.id || node.id === this.b.id;
  }

  /** Euclidean length in the plane. */
  length(): number {
    return this.a.position.distance(this.b.position);
  }
}
