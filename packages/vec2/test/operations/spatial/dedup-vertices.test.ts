import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../../src/core/epsilon';
import { Vec2 } from '../../../src/core/vec2';
import { dedupVertices } from '../../../src/operations/spatial/dedup-vertices';

describe('dedupVertices', () => {
  test('keeps distinct vertices', () => {
    const input = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1), new Vec2(0, 1)];
    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);

    expect(vertices).toHaveLength(4);
    expect(remap).toEqual([0, 1, 2, 3]);
  });

  test('merges coincident vertices', () => {
    const input = [new Vec2(0, 0), new Vec2(0, 0), new Vec2(1, 0)];
    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);

    expect(vertices).toHaveLength(2);
    expect(remap[0]).toBe(remap[1]);
    expect(remap[2]).not.toBe(remap[0]);
  });

  test('merges vertices within slack across neighboring cells', () => {
    const input = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1e-7), new Vec2(0, 1)];
    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);

    expect(vertices).toHaveLength(3);
    expect(remap[1]).toBe(remap[2]);
  });

  test('keeps first mapped vertex when several are within slack', () => {
    const input = [new Vec2(0, 0), new Vec2(1e-7, 0), new Vec2(2e-7, 0)];
    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);

    expect(vertices).toHaveLength(1);
    expect(remap).toEqual([0, 0, 0]);
  });

  test('does not merge vertices farther apart than slack', () => {
    const input = [new Vec2(0, 0), new Vec2(1, 0)];
    const { vertices, remap } = dedupVertices(input, Epsilon.preferIn, 1);

    expect(vertices).toHaveLength(2);
    expect(remap).toEqual([0, 1]);
  });
});
