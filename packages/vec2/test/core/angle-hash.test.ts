import { describe, expect, test } from 'bun:test';

import { Angle, TAU } from '../../src/core/angle';
import { expectClose } from '../testHelpers';

describe('Angle hash', () => {
  test('hashes common tau angles into degree buckets at precision 1', () => {
    expect(Angle.getAngleHash(0, 1, 'tau')).toBe(0);
    expect(Angle.getAngleHash(Math.PI / 2, 1, 'tau')).toBe(90);
    expect(Angle.getAngleHash(Math.PI, 1, 'tau')).toBe(180);
    expect(Angle.getAngleHash((3 * Math.PI) / 2, 1, 'tau')).toBe(270);
    expect(Angle.getAngleHash(TAU, 1, 'tau')).toBe(0);
  });

  test('dehashes bucket centers for precision 1', () => {
    const shape = { domainKind: 'tau' as const, precision: 1 as const };
    expectClose(Angle.dehashAngle(0, shape), 0);
    expectClose(Angle.dehashAngle(90, shape), Math.PI / 2);
    expectClose(Angle.dehashAngle(180, shape), Math.PI);
  });

  test('pi domain uses half as many buckets', () => {
    const shape = { domainKind: 'pi' as const, precision: 1 as const };
    expect(Angle.getAngleHash(Math.PI / 2, 1, 'pi')).toBe(90);
    expect(Angle.getAngleHash(Math.PI, 1, 'pi')).toBe(179);
    expectClose(Angle.dehashAngle(90, shape), Math.PI / 2);
  });

  test('round-trip stays within half a bucket', () => {
    const shape = { domainKind: 'tau' as const, precision: 1e-1 as const };
    const original = 1.234;
    const restored = Angle.dehashAngle(Angle.getAngleHash(original, shape.precision, shape.domainKind), shape);
    expect(Math.abs(restored - original)).toBeLessThan(TAU / 3600);
  });

  test('wraps the last tau bucket back to 0 instead of clamping (M11)', () => {
    const degrees = (value: number) => value / Angle.degreeScale;
    expect(Angle.getAngleHash(degrees(359.9), 1, 'tau')).toBe(0);
    expect(Angle.getAngleHash(degrees(359.4), 1, 'tau')).toBe(359);
    expect(Angle.getAngleHash(degrees(359.96), 0.1, 'tau')).toBe(0);
    // The π domain is not periodic: its top bucket still clamps.
    expect(Angle.getAngleHash(Math.PI, 1, 'pi')).toBe(179);
  });
});
