import { describe, expect, test } from 'bun:test';
import { Angle, TAU } from '../../src/core/angle';
import { Deserialise } from '../../src/io/deserialise';
import { Vec2 } from '../../src/core/vec2';
import { expectClose } from '../testHelpers';

describe('Angle', () => {
  test('wrapToTau maps into [0, 2π)', () => {
    expectClose(Angle.wrapToTau(0), 0);
    expectClose(Angle.wrapToTau(TAU), 0);
    expectClose(Angle.wrapToTau(-Math.PI / 2), (3 * Math.PI) / 2);
    expectClose(Angle.wrapToTau(5 * Math.PI), Math.PI);
  });

  test('foldToPi maps directed tau angles into [0, π]', () => {
    expectClose(Angle.foldToPi(Math.PI / 2), Math.PI / 2);
    expectClose(Angle.foldToPi((3 * Math.PI) / 2), Math.PI / 2);
    expectClose(Angle.foldToPi(Math.PI), Math.PI);
  });

  test('fromTwoVectors is directed CCW in tau domain', () => {
    const angle = Angle.fromTwoVectors(new Vec2(1, 0), new Vec2(0, 1));
    expectClose(angle.radians(), Math.PI / 2);
    expect(angle.isTauDomain()).toBe(true);
  });

  test('fromTwoVectors ignoreSens folds into pi domain', () => {
    const cw = Angle.fromTwoVectors(new Vec2(0, 1), new Vec2(1, 0), { ignoreSens: true });
    const ccw = Angle.fromTwoVectors(new Vec2(1, 0), new Vec2(0, 1), { ignoreSens: true });
    expectClose(cw.radians(), Math.PI / 2);
    expectClose(ccw.radians(), Math.PI / 2);
    expect(cw.isPiDomain()).toBe(true);
  });

  test('vectorWithX matches fromTwoVectors(baseX, v)', () => {
    const v = new Vec2(0, -1);
    expectClose(Angle.vectorWithX(v).radians(), Angle.fromTwoVectors(Vec2.baseX(), v).radians());
  });

  test('fromPt3 delegates to fromTwoVectors', () => {
    const a = new Vec2(1, 0);
    const b = new Vec2(0, 0);
    const c = new Vec2(0, 1);
    expectClose(Angle.fromPt3(a, b, c).radians(), Math.PI / 2);
    expectClose(Angle.fromPt3(c, b, a, { ignoreSens: true }).radians(), Math.PI / 2);
  });

  test('json round-trips value, domain, and precision', () => {
    const angle = Angle.fromTwoVectors(new Vec2(1, 0), new Vec2(-1, 0), { precision: 1e-2 });
    const restored = Deserialise.angle(angle.toJson());
    expectClose(restored.radians(), angle.radians());
    expect(restored.getPrecision()).toBe(1e-2);
    expect(restored.isTauDomain()).toBe(true);
  });

  test('hash round-trip requires explicit shape', () => {
    const angle = Angle.fromRadians(Math.PI / 2, 1);
    const hash = angle.hash();
    const restored = Angle.fromHash(hash, { domainKind: 'tau', precision: 1 });
    expectClose(restored.radians(), Math.PI / 2);
    expect(restored.isTauDomain()).toBe(true);
    expect(restored.getPrecision()).toBe(1);
  });

  test('rejects zero-length vectors', () => {
    expect(() => Angle.fromTwoVectors(new Vec2(0, 0), new Vec2(1, 0))).toThrow('zero-length');
    expect(() => Angle.vectorWithX(new Vec2(0, 0))).toThrow('zero-length');
  });

  test('isRightAngle accepts 90° and 270°, not 135° or 180° (M1)', () => {
    expect(Angle.fromDegrees(90).isRightAngle()).toBe(true);
    expect(Angle.fromDegrees(270).isRightAngle()).toBe(true);
    expect(Angle.fromDegrees(135).isRightAngle()).toBe(false);
    expect(Angle.fromDegrees(180).isRightAngle()).toBe(false);
  });

  test('equals uses precision in degrees and wraps around the full turn (M9)', () => {
    expect(Angle.fromDegrees(90).equals(Angle.fromDegrees(93))).toBe(false);
    expect(Angle.fromDegrees(90).equals(Angle.fromDegrees(90.05))).toBe(true);
    expect(Angle.fromDegrees(90, 1).equals(Angle.fromDegrees(90.9, 1))).toBe(true);
    expect(Angle.fromDegrees(90, 1).equals(Angle.fromDegrees(91.5, 1))).toBe(false);
    expect(Angle.fromDegrees(359.99).equals(Angle.fromDegrees(0))).toBe(true);
    expect(Angle.Tau.equals(Angle.fromDegrees(0))).toBe(true);
  });

  test('wrapToTau never returns 2π (M10)', () => {
    for (const radians of [-1e-17, -1e-300, -Number.EPSILON, TAU, -TAU, 3 * TAU]) {
      const wrapped = Angle.wrapToTau(radians);
      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(TAU);
    }
  });
});
