import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../../src/core/epsilon';
import { Mat3 } from '../../../src/core/mat3';
import { Vec2 } from '../../../src/core/vec2';
import { Arc2, segmentOf } from '../../../src/geometry/primitives/arc2';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { expectClose, expectVec2Close } from '../../testHelpers';

const origin = new Vec2(0, 0);
const east = new Vec2(2, 0);

describe('Arc2 sagitta ↔ radius, centre and sweep', () => {
  const cases: [string, number, number, Vec2, number][] = [
    // name, sagitta, radius, centre, sweep (CCW positive)
    ['minor arc, bulging left', 0.5, 1.25, new Vec2(1, -0.75), -4 * Math.atan(0.5)],
    ['minor arc, bulging right', -0.5, 1.25, new Vec2(1, 0.75), 4 * Math.atan(0.5)],
    ['half circle, left', 1, 1, new Vec2(1, 0), -Math.PI],
    ['half circle, right', -1, 1, new Vec2(1, 0), Math.PI],
    ['major arc, left', 2, 1.25, new Vec2(1, 0.75), -4 * Math.atan(2)],
    ['major arc, right', -2, 1.25, new Vec2(1, -0.75), 4 * Math.atan(2)],
  ];

  for (const [name, sagitta, radius, centre, sweep] of cases) {
    test(name, () => {
      const arc = new Arc2(origin, east, sagitta);
      expectClose(arc.chordLength(), 2);
      expectClose(arc.radius(), radius);
      expectVec2Close(arc.centre(), centre);
      expectClose(arc.sweep(), sweep);
      expectClose(arc.length(), radius * Math.abs(sweep));
      expectVec2Close(arc.apex(), new Vec2(1, sagitta));
      expectVec2Close(arc.evaluate(0.5), arc.apex());
      expectVec2Close(arc.evaluate(1), east);
      // Rebuilding from centre, radius and sweep gives the same sagitta back.
      const rebuilt = Arc2.fromCentre(arc.centre(), arc.radius(), arc.startAngle(), arc.sweep());
      expectClose(rebuilt.sagitta, sagitta);
      expectVec2Close(rebuilt.to, east);
      expect(arc.circle().radius).toBeCloseTo(radius);
    });
  }
});

describe('Arc2 construction', () => {
  test('a sagitta within epsilon is a Line2; segmentOf picks the type', () => {
    expect(() => new Arc2(origin, east, 1e-7)).toThrow(/Line2/);
    expect(segmentOf(origin, east, 1e-7, Epsilon.preferIn)).toBeInstanceOf(Line2);
    expect(segmentOf(origin, east, 0.3, Epsilon.preferIn)).toBeInstanceOf(Arc2);
  });

  test('a non-positive epsilon throws', () => {
    expect(() => new Arc2(origin, east, 0.5, Epsilon.preferOut)).toThrow(/epsilon/);
  });

  test('a zero-length chord and non-finite sagitta throw', () => {
    expect(() => new Arc2(origin, new Vec2(1e-7, 0), 0.5)).toThrow(/chord/);
    expect(() => new Arc2(origin, east, Number.NaN)).toThrow(/finite/);
    expect(() => new Arc2(origin, east, Infinity)).toThrow(/finite/);
  });

  test('only from, to and sagitta are own properties', () => {
    const arc = new Arc2(origin, east, 0.5);
    arc.radius();
    expect(Object.keys(arc)).toEqual(['from', 'to', 'sagitta']);
    expect(arc.type).toBe('Arc2');
  });

  test('fromThreePoints', () => {
    const arc = Arc2.fromThreePoints(origin, new Vec2(1, 1), east);
    expectClose(arc.sagitta, 1);
    const major = Arc2.fromThreePoints(origin, new Vec2(1, -2), east);
    expectClose(major.sagitta, -2);
    expect(() => Arc2.fromThreePoints(origin, new Vec2(1, 0), east)).toThrow(/collinear/);
  });

  test('fromCentre validates the sweep', () => {
    expect(() => Arc2.fromCentre(origin, 1, 0, 0)).toThrow(/sweep/);
    expect(() => Arc2.fromCentre(origin, 1, 0, 2 * Math.PI)).toThrow(/sweep/);
    const quarter = Arc2.fromCentre(origin, 1, 0, Math.PI / 2);
    expectVec2Close(quarter.to, new Vec2(0, 1));
    expect(quarter.sagitta).toBeLessThan(0); // counter-clockwise
  });

  test('fromTangent leaves along the tangent', () => {
    const arc = Arc2.fromTangent(origin, new Vec2(0, 1), east);
    expectClose(arc.sagitta, 1); // a half circle over the chord, turning clockwise
    expectVec2Close(arc.tangent(0), new Vec2(0, 1));
    const ccw = Arc2.fromTangent(origin, new Vec2(1, 0), new Vec2(1, 1));
    expectVec2Close(ccw.tangent(0), new Vec2(1, 0));
    expectVec2Close(ccw.tangent(1), new Vec2(0, 1));
    expectClose(ccw.radius(), 1);
  });
});

describe('Arc2.fromFillet', () => {
  test('a 90° left turn: tangent distance equals the radius', () => {
    const arc = Arc2.fromFillet(new Vec2(-5, 0), origin, new Vec2(0, 5), 2);
    expectVec2Close(arc.from, new Vec2(-2, 0));
    expectVec2Close(arc.to, new Vec2(0, 2));
    expectVec2Close(arc.centre(), new Vec2(-2, 2));
    expectClose(arc.radius(), 2);
    expect(arc.sagitta).toBeLessThan(0); // left turn: counter-clockwise
    expectVec2Close(arc.tangent(0), new Vec2(1, 0));
    expectVec2Close(arc.tangent(1), new Vec2(0, 1));
  });

  test('a right turn bulges the other way', () => {
    const arc = Arc2.fromFillet(new Vec2(-5, 0), origin, new Vec2(0, -5), 1);
    expect(arc.sagitta).toBeGreaterThan(0);
    expectVec2Close(arc.tangent(0), new Vec2(1, 0));
    expectVec2Close(arc.tangent(1), new Vec2(0, -1));
    expectVec2Close(arc.centre(), new Vec2(-1, -1));
  });

  test('throws when collinear, folding back or too long for a leg', () => {
    expect(() => Arc2.fromFillet(new Vec2(-1, 0), origin, new Vec2(1, 0), 1)).toThrow(/collinear/);
    expect(() => Arc2.fromFillet(new Vec2(-1, 0), origin, new Vec2(-2, 0), 1)).toThrow(/fold/);
    expect(() => Arc2.fromFillet(new Vec2(-1, 0), origin, new Vec2(0, 5), 2)).toThrow(/longer/);
  });
});

describe('Arc2 sign convention', () => {
  const arc = new Arc2(origin, east, 0.5);

  test('s > 0 puts the apex left of the chord and curves clockwise', () => {
    expect(east.crossProduct(arc.apex())).toBeGreaterThan(0);
    expect(arc.curvature()).toBeLessThan(0);
    expectClose(arc.curvature(), -1 / arc.radius());
    expect(arc.sweep()).toBeLessThan(0);
  });

  test('tangent and left normal', () => {
    expectVec2Close(arc.tangent(0.5), new Vec2(1, 0));
    expectVec2Close(arc.normal(0.5), new Vec2(0, 1));
  });

  test('reverse keeps the same points', () => {
    const reversed = arc.reverse();
    expectClose(reversed.sagitta, -0.5);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expectVec2Close(reversed.evaluate(1 - t), arc.evaluate(t));
    }
  });

  test('evaluateAtLength is proportional to arc length', () => {
    expectVec2Close(arc.evaluateAtLength(arc.length() / 2), arc.apex());
  });
});

describe('Arc2 queries', () => {
  const arc = new Arc2(origin, east, 1); // half circle above the chord: centre (1, 0), apex (1, 1)

  test('closest parameter: projection, centre, outside the sweep', () => {
    expectClose(arc.closestParameterForPoint(new Vec2(1, 5)), 0.5);
    expect(arc.closestParameterForPoint(arc.centre())).toBe(0);
    expect(arc.closestParameterForPoint(new Vec2(0.5, -3))).toBe(0);
    expect(arc.closestParameterForPoint(new Vec2(1.5, -3))).toBe(1);
    expectClose(arc.distanceToPoint(new Vec2(1, 3)), 2);
    expectVec2Close(arc.closestPointForPoint(new Vec2(1, 3)), new Vec2(1, 1));
  });

  test('aabb2 of a major arc crossing extreme points', () => {
    const major = new Arc2(origin, east, 2); // centre (1, 0.75), radius 1.25
    const box = major.aabb2();
    expectClose(box.x.min, 1 - 1.25);
    expectClose(box.x.max, 1 + 1.25);
    expectClose(box.y.min, 0);
    expectClose(box.y.max, 2);
  });

  test('containsAngle', () => {
    expect(arc.containsAngle(Math.PI / 2)).toBe(true);
    expect(arc.containsAngle(-Math.PI / 2)).toBe(false);
  });
});

describe('Arc2 transforms', () => {
  const arc = new Arc2(origin, east, 0.5);

  test('offset keeps centre and sweep', () => {
    const outer = arc.offset(1); // left of a clockwise arc is away from the centre
    expectClose(outer.radius(), arc.radius() + 1);
    expectVec2Close(outer.centre(), arc.centre());
    expectClose(outer.sweep(), arc.sweep());
    const inner = arc.offset(-1);
    expectClose(inner.radius(), arc.radius() - 1);
    expect(() => arc.offset(-1.25)).toThrow(/collapses/);
  });

  test('rotation, uniform scale and reflection', () => {
    const rotated = arc.transform(Mat3.rotation(Math.PI / 2));
    expectClose(rotated.sagitta, 0.5);
    expectVec2Close(rotated.apex(), new Vec2(-0.5, 1));
    const scaled = arc.transform(Mat3.scale(3));
    expectClose(scaled.sagitta, 1.5);
    const reflected = arc.transform(Mat3.scale(1, -1));
    expectClose(reflected.sagitta, -0.5);
    expectVec2Close(reflected.apex(), new Vec2(1, -0.5));
  });

  test('a shear or non-uniform scale throws', () => {
    expect(() => arc.transform(Mat3.scale(2, 1))).toThrow(/similarity/);
    expect(() => arc.transform(Mat3.fromValues(1, 1, 0, 0, 1, 0, 0, 0, 1))).toThrow(/similarity/);
  });

  test('toPolyline uses the fewest equal steps within the tolerance', () => {
    const half = new Arc2(origin, east, 1);
    const points = half.toPolyline(0.01);
    const step = 2 * Math.acos(1 - 0.01);
    expect(points.length).toBe(Math.ceil(Math.PI / step) + 1);
    expectVec2Close(points[0]!, origin);
    expectVec2Close(points[points.length - 1]!, east);
    expect(half.toPolyline(10).length).toBe(2);
  });

  test('JSON', () => {
    expect(arc.toJson()).toEqual({ type: 'Arc2', from: origin.toJson(), to: east.toJson(), sagitta: 0.5 });
  });
});
