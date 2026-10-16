import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { UndirectedEdge2D } from './undirected-edge-2d';

/** Planar node in an undirected graph. */
export class UndirectedNode2D {
  /** Adjacency list; payload type is recovered via `edgesOf<T>()`. */
  readonly edges: UndirectedEdge2D<any>[] = [];

  constructor(
    public readonly id: string,
    public position: Vec2,
  ) {}

  /** Incident edges typed for a specific edge payload. */
  edgesOf<T extends object>(): UndirectedEdge2D<T>[] {
    return this.edges as UndirectedEdge2D<T>[];
  }

  hasEdge(edge: UndirectedEdge2D<any>): boolean {
    return this.edges.some((candidate) => candidate.id === edge.id);
  }

  addEdge(edge: UndirectedEdge2D<any>): void {
    if (!this.hasEdge(edge)) this.edges.push(edge);
  }

  removeEdge(edge: UndirectedEdge2D<any>): void {
    const index = this.edges.findIndex((candidate) => candidate.id === edge.id);
    if (index >= 0) this.edges.splice(index, 1);
  }

  /** Neighbours reachable by a single hop. */
  neighbors(): UndirectedNode2D[] {
    return this.edges.map((edge) => edge.other(this));
  }
}
