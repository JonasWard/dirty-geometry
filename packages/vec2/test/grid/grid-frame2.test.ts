import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../src/core/vec2';
import { Frame2 } from '../../src/core/frame2';

describe('Frame2', () => {
  test('worldXY default', () => {
    const frame = Frame2.worldXY();
    expect(frame.toWorld(new Vec2(2, 3)).x).toBeCloseTo(2);
    expect(frame.toWorld(new Vec2(2, 3)).y).toBeCloseTo(3);
    expect(frame.toLocal(new Vec2(2, 3)).x).toBeCloseTo(2);
    expect(frame.toLocal(new Vec2(2, 3)).y).toBeCloseTo(3);
  });

  test('toWorld and toLocal round-trip', () => {
    const frame = new Frame2(new Vec2(1, 2), new Vec2(2, 0), new Vec2(0, 3));
    const local = new Vec2(1.5, -0.5);
    const roundTrip = frame.toLocal(frame.toWorld(local));
    expect(roundTrip.x).toBeCloseTo(local.x);
    expect(roundTrip.y).toBeCloseTo(local.y);
  });

  test('clone preserves transform', () => {
    const frame = new Frame2(new Vec2(1, 2), new Vec2(1, 0.5), new Vec2(-0.3, 1));
    const cloned = frame.clone();
    const world = frame.toWorld(new Vec2(1, 1));
    const clonedWorld = cloned.toWorld(new Vec2(1, 1));
    expect(clonedWorld.x).toBeCloseTo(world.x);
    expect(clonedWorld.y).toBeCloseTo(world.y);
  });
});
