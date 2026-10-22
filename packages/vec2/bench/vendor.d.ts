// Minimal typings for the comparison libraries used by the CDT bench and oracle tests (dev only).
declare module 'delaunator' {
  export default class Delaunator<P = ArrayLike<number>> {
    constructor(coords: ArrayLike<number>);
    static from(points: ArrayLike<ArrayLike<number>>): Delaunator;
    coords: ArrayLike<number>;
    triangles: Uint32Array;
    halfedges: Int32Array;
    hull: Uint32Array;
  }
}

declare module 'cdt2d' {
  type Options = { delaunay?: boolean; interior?: boolean; exterior?: boolean };
  export default function cdt2d(
    points: readonly (readonly [number, number])[],
    edges?: readonly (readonly [number, number])[],
    options?: Options,
  ): [number, number, number][];
}
