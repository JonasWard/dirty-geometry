import { describe, expect, test } from 'bun:test';
import { Vec2 } from '../../src/core/vec2';
import { Frame2 } from '../../src/core/frame2';
import { Mat3 } from '../../src/core/mat3';

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

  test('transform keeps axes as directions (M2)', () => {
    const frame = new Frame2(new Vec2(10, 0));
    const same = frame.transform(Mat3.identity());
    expect([same.origin.x, same.origin.y, same.xAxis.x, same.xAxis.y]).toEqual([10, 0, 1, 0]);

    const moved = frame.transform(Mat3.translation(5, 0));
    expect([moved.origin.x, moved.origin.y]).toEqual([15, 0]);
    expect([moved.xAxis.x, moved.xAxis.y, moved.yAxis.x, moved.yAxis.y]).toEqual([1, 0, 0, 1]);

    const turned = frame.transform(Mat3.rotation(Math.PI / 2));
    expect(turned.origin.x).toBeCloseTo(0);
    expect(turned.origin.y).toBeCloseTo(10);
    expect(turned.xAxis.x).toBeCloseTo(0);
    expect(turned.xAxis.y).toBeCloseTo(1);
  });
});
