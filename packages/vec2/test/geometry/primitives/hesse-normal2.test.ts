import { describe, expect, test } from 'bun:test';
import { Mat3 } from '../../../src/core/mat3';
import { Vec2 } from '../../../src/core/vec2';
import { Hesse2 } from '../../../src/geometry/primitives/hesse2';
import { InfiniteLine2 } from '../../../src/geometry/primitives/infinite-line2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('Hesse2', () => {
  test('normalizes non-unit normals and scales offset', () => {
    const hesse = new Hesse2(new Vec2(0, 2), 4);

    expectVec2Close(hesse.normal, new Vec2(0, 1));
    expectClose(hesse.offset, 2);
  });

  test('rejects zero normal', () => {
    expect(() => new Hesse2(new Vec2(0, 0), 1)).toThrow('non-zero normal');
  });

  test('signedDistance matches InfiniteLine2 left-of-direction convention', () => {
    const line = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const hesse = Hesse2.fromInfiniteLine(line);
    const point = new Vec2(2, 3);

    expectVec2Close(hesse.normal, new Vec2(0, 1));
    expectClose(hesse.offset, 0);
    expectClose(hesse.signedDistance(point), line.signedDistance(point));
    expectClose(hesse.signedDistance(new Vec2(0, -5)), -5);
  });

  test('round-trips with InfiniteLine2 for angled lines', () => {
    const line = new InfiniteLine2(new Vec2(1, 1), new Vec2(2, 2));
    const hesse = Hesse2.fromInfiniteLine(line);
    const restored = hesse.infiniteLine();
    const point = new Vec2(0, 2);

    expectClose(hesse.signedDistance(point), line.signedDistance(point));
    expectClose(restored.signedDistance(point), line.signedDistance(point));
    expect(restored.direction.parallel(line.direction)).toBe(true);
    expect(restored.direction.antiparallel(line.direction)).toBe(false);
  });

  test('closestPointForPoint projects onto the line', () => {
    const hesse = Hesse2.fromInfiniteLine(new InfiniteLine2(new Vec2(0, 2), new Vec2(1, 0)));
    expectVec2Close(hesse.closestPointForPoint(new Vec2(5, 7)), new Vec2(5, 2));
  });

  test('flip reverses half-plane side', () => {
    const hesse = new Hesse2(new Vec2(0, 1), 0);
    const flipped = hesse.flip();
    const point = new Vec2(0, 3);

    expectClose(flipped.signedDistance(point), -hesse.signedDistance(point));
    expectClose(flipped.offset, 0);
  });

  test('canonicalizeUndirected folds antiparallel normals', () => {
    const down = new Hesse2(new Vec2(0, -1), -2);
    const canonical = down.canonicalizeUndirected();

    expectVec2Close(canonical.normal, new Vec2(0, 1));
    expectClose(canonical.offset, 2);
  });

  test('transform follows InfiniteLine2.transform', () => {
    const line = new InfiniteLine2(new Vec2(0, 1), new Vec2(1, 0));
    const matrix = Mat3.translation(2, 3).multiply(Mat3.rotation(Math.PI / 2));
    const transformed = Hesse2.fromInfiniteLine(line).transform(matrix);
    const expected = Hesse2.fromInfiniteLine(line.transform(matrix));
    const probe = new Vec2(4, -1);

    expectClose(transformed.signedDistance(probe), expected.signedDistance(probe));
  });

  test('toJson', () => {
    const hesse = new Hesse2(new Vec2(0, 1), 2);
    expect(hesse.toJson()).toEqual({
      type: 'Hesse2',
      normal: { type: 'Vec2', x: 0, y: 1 },
      offset: 2,
    });
  });

  test('hash / fromHash preserves orientation within bucket tolerance', () => {
    const original = Hesse2.fromInfiniteLine(new InfiniteLine2(new Vec2(1, 2), new Vec2(3, 1)));
    const restored = Hesse2.fromHash(original.hash());
    const probe = new Vec2(4, -1);

    expect(Math.sign(restored.signedDistance(probe))).toBe(Math.sign(original.signedDistance(probe)));
    expectClose(restored.signedDistance(probe), original.signedDistance(probe), 1e-2);
    expectClose(restored.direction().unit().dot(original.direction().unit()), 1, 1e-3);
    expectClose(restored.offset, original.offset, 1e-5);
  });
});
