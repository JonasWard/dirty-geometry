import { Vec2 } from '../../src/core/vec2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';

type Rect = { x0: number; y0: number; x1: number; y1: number };

function rectCenterIn(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function rectInteriorContains(rect: Rect, x: number, y: number): boolean {
  return x > rect.x0 && x < rect.x1 && y > rect.y0 && y < rect.y1;
}

/** Axis-aligned material region: union of rectangles minus rectangular holes. */
function meshFromRectRegions(outer: readonly Rect[], holes: readonly Rect[]): TriMesh2 {
  const xs = new Set<number>();
  const ys = new Set<number>();

  for (const rect of outer) {
    xs.add(rect.x0);
    xs.add(rect.x1);
    ys.add(rect.y0);
    ys.add(rect.y1);
  }
  for (const hole of holes) {
    xs.add(hole.x0);
    xs.add(hole.x1);
    ys.add(hole.y0);
    ys.add(hole.y1);
  }

  const xArr = [...xs].sort((a, b) => a - b);
  const yArr = [...ys].sort((a, b) => a - b);
  const vertexIndex = new Map<string, number>();
  const vertices: Vec2[] = [];

  function vertexAt(x: number, y: number): number {
    const key = `${x},${y}`;
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;

    const index = vertices.length;
    vertices.push(new Vec2(x, y));
    vertexIndex.set(key, index);
    return index;
  }

  const triangles: [number, number, number][] = [];

  for (let xi = 0; xi < xArr.length - 1; xi++) {
    for (let yi = 0; yi < yArr.length - 1; yi++) {
      const x0 = xArr[xi]!;
      const x1 = xArr[xi + 1]!;
      const y0 = yArr[yi]!;
      const y1 = yArr[yi + 1]!;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;

      if (!outer.some((rect) => rectCenterIn(rect, cx, cy))) continue;
      if (holes.some((hole) => rectInteriorContains(hole, cx, cy))) continue;

      const a = vertexAt(x0, y0);
      const b = vertexAt(x1, y0);
      const c = vertexAt(x1, y1);
      const d = vertexAt(x0, y1);
      triangles.push([a, b, c], [a, c, d]);
    }
  }

  return new TriMesh2(vertices, triangles);
}

export function annulusMesh(): TriMesh2 {
  return new TriMesh2(
    [
      new Vec2(0, 0),
      new Vec2(3, 0),
      new Vec2(3, 3),
      new Vec2(0, 3),
      new Vec2(1, 1),
      new Vec2(2, 1),
      new Vec2(2, 2),
      new Vec2(1, 2),
    ],
    [
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ],
  );
}

export function squareMesh(): TriMesh2 {
  return new TriMesh2(
    [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)],
    [
      [0, 1, 2],
      [0, 2, 3],
    ],
  );
}

/** 10×8 plate with four scattered square cutouts. */
export function swissCheeseMesh(): TriMesh2 {
  return meshFromRectRegions(
    [{ x0: 0, y0: 0, x1: 10, y1: 8 }],
    [
      { x0: 1, y0: 1, x1: 2.5, y1: 2.5 },
      { x0: 4, y0: 5, x1: 5.5, y1: 6.5 },
      { x0: 7, y0: 1, x1: 8.5, y1: 3 },
      { x0: 2, y0: 5.5, x1: 3.5, y1: 7 },
    ],
  );
}

/** L-shaped wing with three rectangular holes. */
export function lWingMesh(): TriMesh2 {
  return meshFromRectRegions(
    [
      { x0: 0, y0: 0, x1: 9, y1: 4 },
      { x0: 0, y0: 4, x1: 4, y1: 11 },
    ],
    [
      { x0: 1, y0: 1, x1: 2.5, y1: 2.5 },
      { x0: 6, y0: 1, x1: 7.5, y1: 2.5 },
      { x0: 1, y0: 6, x1: 2.5, y1: 8 },
    ],
  );
}

/** Stepped building footprint with three courtyard holes. */
export function buildingYardMesh(): TriMesh2 {
  return meshFromRectRegions(
    [
      { x0: 0, y0: 0, x1: 14, y1: 4 },
      { x0: 0, y0: 4, x1: 10, y1: 8 },
      { x0: 0, y0: 8, x1: 6, y1: 10 },
      { x0: 10, y0: 8, x1: 18, y1: 14 },
    ],
    [
      { x0: 2, y0: 2, x1: 4, y1: 4 },
      { x0: 11, y0: 2, x1: 13, y1: 4 },
      { x0: 8, y0: 10, x1: 12, y1: 13 },
    ],
  );
}

/** Wide H-shaped plate with five holes. */
export function hPlateMesh(): TriMesh2 {
  return meshFromRectRegions(
    [
      { x0: 0, y0: 0, x1: 12, y1: 3 },
      { x0: 0, y0: 3, x1: 3, y1: 9 },
      { x0: 9, y0: 3, x1: 12, y1: 9 },
      { x0: 0, y0: 9, x1: 12, y1: 12 },
    ],
    [
      { x0: 1, y0: 1, x1: 2.5, y1: 2 },
      { x0: 4.5, y0: 4.5, x1: 7.5, y1: 7.5 },
      { x0: 9.5, y0: 1, x1: 11, y1: 2 },
      { x0: 1, y0: 10, x1: 2.5, y1: 11 },
      { x0: 9.5, y0: 10, x1: 11, y1: 11 },
    ],
  );
}

/** Large square plate with a regular grid of holes — for performance benchmarks. */
export function perfPlateMesh(cells: number, holeStride: number): TriMesh2 {
  const holes: Rect[] = [];

  for (let x = holeStride; x < cells - 1; x += holeStride) {
    for (let y = holeStride; y < cells - 1; y += holeStride) {
      holes.push({ x0: x, y0: y, x1: x + 1, y1: y + 1 });
    }
  }

  return meshFromRectRegions([{ x0: 0, y0: 0, x1: cells, y1: cells }], holes);
}
