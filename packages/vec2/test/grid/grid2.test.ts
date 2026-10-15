import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../src/core/vec2';
import { Frame2 } from '../../src/core/frame2';
import { Mat3 } from '../../src/core/mat3';
import { Interval2 } from '../../src/bounds/interval2';
import { Axis } from '../../src/grid/core/grid-axis';
import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { Grid2 } from '../../src/grid/core/grid2';
import { GridCell2Collection } from '../../src/grid/regions/grid-cell2-collection';

describe('Axis', () => {
  test('unit and uniform factories', () => {
    expect(Axis.unit().isUnit()).toBe(true);
    expect(Axis.uniform(1).kind()).toBe('unit');
    expect(Axis.uniform(2).isUniform()).toBe(true);
    expect(Axis.uniform(2).isUnit()).toBe(false);
  });

  test('custom sizes and edge mapping', () => {
    const axis = Axis.custom(1, { 1: 2, 0: 0.5 });
    expect(axis.edge(0)).toBe(0);
    expect(axis.edge(1)).toBe(0.5);
    expect(axis.edge(2)).toBe(2.5);
    expect(axis.indexAt(0.25)).toBe(0);
    expect(axis.indexAt(1.5)).toBe(1);
  });

  test('domain rejects out-of-range indexes', () => {
    const axis = Axis.uniform(2, new Interval2(0, 2));
    expect(axis.isConstrained()).toBe(true);
    expect(axis.containsIndex(2)).toBe(true);
    expect(axis.containsIndex(3)).toBe(false);
    expect(() => axis.size(3)).toThrow();
    expect(axis.indexAt(5)).toBe(2);
    expect(axis.indexAt(6)).toBeNull();
  });
});

describe('Grid2', () => {
  test('default cell dimensions', () => {
    const grid = new Grid2();
    expect(grid.isUnit()).toBe(true);
    expect(grid.constraint()).toBe('unconstrained');
    expect(grid.columnWidth(0)).toBe(1);
    expect(grid.rowHeight(0)).toBe(1);
    expect(grid.cellX(2)).toBe(2);
    expect(grid.cellY(3)).toBe(3);
  });

  test('column and row overrides', () => {
    const grid = new Grid2({
      u: Axis.custom(1, { 1: 2 }),
      v: Axis.custom(1, { 0: 0.5 }),
    });

    expect(grid.cellX(2)).toBe(3);
    expect(grid.cellY(1)).toBe(0.5);
  });

  test('customWidth and customHeight', () => {
    const grid = new Grid2();
    grid.setCustomWidth(1, 2).setCustomHeight(0, 0.5);

    expect(grid.u.kind()).toBe('custom');
    expect(grid.cellX(2)).toBe(3);
    expect(grid.cellY(1)).toBe(0.5);

    grid.setCustomWidth(1, 1);
    expect(grid.columnWidth(1)).toBe(1);
    expect(grid.u.customSizes()[1]).toBeUndefined();
  });

  test('uniform grid helpers', () => {
    const grid = Grid2.uniform(2, 3);
    expect(grid.isUnit()).toBe(false);
    expect(grid.columnWidth(0)).toBe(2);
    expect(grid.rowHeight(0)).toBe(3);
    grid.setCustomWidth(0, 5);
    expect(grid.columnWidth(0)).toBe(5);
    expect(grid.rowHeight(0)).toBe(3);
  });

  test('constraint reflects axis domains', () => {
    const both = new Grid2({
      u: Axis.unit(new Interval2(0, 3)),
      v: Axis.unit(new Interval2(0, 2)),
    });
    expect(both.constraint()).toBe('both');
    expect(both.isConstrained()).toBe(true);

    const onlyU = new Grid2({
      u: Axis.unit(new Interval2(0, 1)),
      v: Axis.unit(),
    });
    expect(onlyU.constraint()).toBe('u');

    const onlyV = new Grid2({
      u: Axis.unit(),
      v: Axis.unit(new Interval2(0, 1)),
    });
    expect(onlyV.constraint()).toBe('v');
  });

  test('cellWorldCorners follow rotated frame', () => {
    const grid = new Grid2({
      frame: new Frame2(new Vec2(0, 0), new Vec2(1, 0.3), new Vec2(-0.2, 1)),
    });
    const cell = new GridCell2(1, 1);
    const corners = grid.cellWorldCorners(cell);
    const local = grid.cellLocalAabb(cell);

    expect(corners[0]!.x).toBeCloseTo(grid.frame.toWorld(local.min()).x);
    expect(corners[0]!.y).toBeCloseTo(grid.frame.toWorld(local.min()).y);
    expect(corners[1]!.x).toBeCloseTo(grid.frame.toWorld(new Vec2(local.max().x, local.min().y)).x);
    expect(corners[1]!.y).toBeCloseTo(grid.frame.toWorld(new Vec2(local.max().x, local.min().y)).y);

    const aabb = grid.cellWorldRect(cell);
    const axisAlignedCorner = new Vec2(aabb.max().x, aabb.min().y);
    expect(corners[1]!.distance(axisAlignedCorner)).toBeGreaterThan(0.01);
  });

  test('cellWorldRect with frame', () => {
    const grid = Grid2.uniform(2, 3, { frame: Frame2.worldXY() });
    const rect = grid.cellWorldRect(new GridCell2(1, 1));

    expect(rect.min().x).toBe(2);
    expect(rect.min().y).toBe(3);
    expect(rect.max().x).toBe(4);
    expect(rect.max().y).toBe(6);
  });

  test('worldToCell with frame', () => {
    const grid = Grid2.uniform(2, 2, { frame: Frame2.worldXY() });
    const cell = grid.worldToCell(new Vec2(3, 1));

    expect(cell).not.toBeNull();
    expect(cell!.i).toBe(1);
    expect(cell!.j).toBe(0);
  });

  test('negative cell indexes sit left/below the origin and round-trip', () => {
    const grid = Grid2.uniform(2, 3);
    grid.setCustomWidth(-1, 4).setCustomHeight(-2, 5);

    expect(grid.cellX(-1)).toBe(-4);
    expect(grid.cellX(0)).toBe(0);
    expect(grid.cellY(-2)).toBe(-(5 + 3));
    expect(grid.cellY(-1)).toBe(-3);

    const cell = new GridCell2(-1, -2);
    const aabb = grid.cellLocalAabb(cell);
    expect(aabb.min().x).toBe(-4);
    expect(aabb.max().x).toBe(0);
    expect(aabb.min().y).toBe(-8);
    expect(aabb.max().y).toBe(-3);

    expect(grid.localToCell(aabb.center())?.equals(cell)).toBe(true);
    expect(grid.localToCell(new Vec2(-0.1, -0.1))?.equals(new GridCell2(-1, -1))).toBe(true);
    expect(GridCell2.fromHash(cell.hash()).equals(cell)).toBe(true);
  });

  test('negative cells participate in neighbor lookup and set ops', () => {
    const origin = new GridCell2(0, 0);
    const left = new GridCell2(-1, 0);
    const neighbors = origin
      .neighbors(1, 'vonNeumann')
      .map((cell) => `${cell.i},${cell.j}`)
      .sort();
    expect(neighbors).toEqual(['-1,0', '0,-1', '0,1', '1,0']);

    const collection = new GridCell2Collection([origin, left, new GridCell2(-2, -1)]);
    expect(collection.has(left)).toBe(true);
    expect(collection.has(new GridCell2(-2, -1))).toBe(true);
  });

  test('cellLocalCenter', () => {
    const grid = Grid2.uniform(2, 4);
    const center = grid.cellLocalCenter(new GridCell2(0, 0));
    expect(center.x).toBe(1);
    expect(center.y).toBe(2);
  });
});

describe('GridCell2', () => {
  test('equals and hash', () => {
    const a = new GridCell2(1, 2);
    const b = new GridCell2(1, 2);
    const c = new GridCell2(2, 1);

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.hash()).toBe(b.hash());
    expect(GridCell2.fromHash(a.hash()).equals(a)).toBe(true);
    expect(GridCell2.fromHash(c.hash()).equals(c)).toBe(true);
  });

  test('negative indexes hash and reconstruct', () => {
    const cell = new GridCell2(-3, -7);
    expect(GridCell2.fromHash(cell.hash()).equals(cell)).toBe(true);
    expect(cell.hash()).not.toBe(new GridCell2(3, 7).hash());
  });
});

describe('Grid2.transform', () => {
  test('transform moves the grid with its frame (M2)', () => {
    const grid = Grid2.unit({ frame: new Frame2(new Vec2(10, 0)) }).transform(Mat3.translation(5, 0));
    const center = grid.cellWorldCenter(new GridCell2(0, 0));
    expect(center.x).toBeCloseTo(15.5);
    expect(center.y).toBeCloseTo(0.5);
  });
});

describe('GridCell2.neighbors at the index limits', () => {
  test('skips cells outside the grid instead of throwing', () => {
    const corner = new GridCell2(Grid2.minIndex, 0);
    expect(
      corner
        .neighbors(1)
        .map((cell) => `${cell.i - Grid2.minIndex},${cell.j}`)
        .sort(),
    ).toEqual(['0,-1', '0,1', '1,0']);
    expect(corner.neighbors(1, 'moore')).toHaveLength(5);
    expect(new GridCell2(Grid2.maxIndex, Grid2.maxIndex).neighbors(1, 'moore')).toHaveLength(3);
  });
});

describe('Grid2.constraintRegion (M12)', () => {
  test('is null for an unconstrained grid', () => {
    expect(new Grid2().constraintRegion()).toBeNull();
  });

  test('spans the axis domains, falling back to the index limits on an unconstrained axis', () => {
    const both = new Grid2({ u: Axis.unit(new Interval2(0, 3)), v: Axis.unit(new Interval2(0, 3)) }).constraintRegion()!;
    expect([both.bottomLeft.i, both.bottomLeft.j, both.topRight.i, both.topRight.j]).toEqual([0, 0, 3, 3]);

    const onlyU = new Grid2({ u: Axis.unit(new Interval2(1, 2)) }).constraintRegion()!;
    expect([onlyU.bottomLeft.i, onlyU.topRight.i]).toEqual([1, 2]);
    expect([onlyU.bottomLeft.j, onlyU.topRight.j]).toEqual([Grid2.minIndex, Grid2.maxIndex]);
  });
});

describe('Axis domains that exclude 0 (M13)', () => {
  test('a positive domain keeps index 0 anchored at local 0', () => {
    const axis = Axis.unit(new Interval2(5, 10));
    expect(axis.edge(5)).toBe(5);
    expect(axis.edge(11)).toBe(11);
    expect(() => axis.edge(4)).toThrow();
    expect(axis.indexAt(5.5)).toBe(5);
    expect(axis.indexAt(10.5)).toBe(10);
    expect(axis.indexAt(0.5)).toBeNull();
    expect(axis.indexAt(11.5)).toBeNull();
  });

  test('a negative domain works below the origin', () => {
    const axis = Axis.uniform(2, new Interval2(-10, -5));
    expect(axis.edge(-10)).toBe(-20);
    expect(axis.edge(-4)).toBe(-8);
    expect(axis.indexAt(-9)).toBe(-5);
    expect(axis.indexAt(-11)).toBe(-6);
    expect(axis.indexAt(-7)).toBeNull();
    expect(axis.indexAt(1)).toBeNull();
  });

  test('custom sizes are summed from the origin on both sides', () => {
    const axis = Axis.custom(1, { 2: 3, [-1]: 2 });
    expect(axis.edge(4)).toBe(6);
    expect(axis.edge(-2)).toBe(-3);
    expect(axis.indexAt(4.5)).toBe(2);
    expect(axis.indexAt(-1.5)).toBe(-1);
    expect(axis.indexAt(-2.5)).toBe(-2);
  });

  test('cells of a grid constrained away from 0 have positions', () => {
    const grid = new Grid2({ u: Axis.unit(new Interval2(5, 10)), v: Axis.unit(new Interval2(5, 10)) });
    const center = grid.cellLocalCenter(new GridCell2(5, 6));
    expect([center.x, center.y]).toEqual([5.5, 6.5]);
    expect(grid.localToCell(new Vec2(7.5, 9.5))?.equals(new GridCell2(7, 9))).toBe(true);
  });
});
