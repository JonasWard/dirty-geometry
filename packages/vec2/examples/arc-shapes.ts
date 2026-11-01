/** Builders for curved demo shapes, shared by the arc and boolean examples. All counter-clockwise. */
import { Vec2 } from '../src/core/vec2';
import type { ArcPolyline2 } from '../src/geometry/curves/arc-polyline2';
import { Arc2 } from '../src/geometry/primitives/arc2';
import { Line2 } from '../src/geometry/primitives/line2';
import { ArcPolygon2 } from '../src/geometry/regions/arc-polygon2';
import { Circle2 } from '../src/geometry/regions/circle2';

/** A rectangle with every corner rounded by `radius`, built from fillets. */
export function roundedRectangle(x: number, y: number, width: number, height: number, radius: number): ArcPolygon2 {
  const corners = [new Vec2(x, y), new Vec2(x + width, y), new Vec2(x + width, y + height), new Vec2(x, y + height)];
  const fillets = corners.map((corner, i) =>
    Arc2.fromFillet(corners[(i + 3) % 4]!, corner, corners[(i + 1) % 4]!, radius),
  );
  return ArcPolygon2.fromSegments(fillets.flatMap((f, i) => [f, new Line2(f.to, fillets[(i + 1) % 4]!.from)]));
}

/** A regular `sides`-gon around `centre` whose sides bulge outwards by `bulge` (inwards when negative). */
export function flower(centre: Vec2, sides: number, radius: number, bulge: number, rotation = 0): ArcPolygon2 {
  const vertices = Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i / sides) * 2 * Math.PI;
    return centre.add(new Vec2(Math.cos(angle), Math.sin(angle)).scale(radius));
  });
  // Walking counter-clockwise, outward is to the right: a negative sagitta.
  return new ArcPolygon2(vertices, new Array(sides).fill(-bulge));
}

/** A flower whose sides dent inwards by `dent`. */
export function scallop(centre: Vec2, sides: number, radius: number, dent: number, rotation = 0): ArcPolygon2 {
  return flower(centre, sides, radius, -dent, rotation);
}

export function disc(x: number, y: number, radius: number): ArcPolygon2 {
  return ArcPolygon2.fromCircle2(new Circle2(new Vec2(x, y), radius));
}

/** A ring as two loops: the outer disc and the inner one reversed into a hole. */
export function annulus(x: number, y: number, outer: number, inner: number): ArcPolygon2[] {
  return [disc(x, y, outer), disc(x, y, inner).inverse()];
}

/** A stadium around the segment `a → b`: two half circles of `radius` joined by straight sides. */
export function pill(a: Vec2, b: Vec2, radius: number): ArcPolygon2 {
  const normal = b.subtract(a).unit().perpendicular().scale(radius);
  return new ArcPolygon2(
    [a.subtract(normal), b.subtract(normal), b.add(normal), a.add(normal)],
    [0, -radius, 0, -radius],
  );
}

/** A wall of `thickness` around a centreline: both offsets, joined by straight end caps. */
export function wallBand(centreline: ArcPolyline2, thickness: number): ArcPolygon2 {
  const right = centreline.offset(-thickness / 2);
  const left = centreline.offset(thickness / 2).reverse();
  const rightSegments = right.segments();
  const leftSegments = left.segments();
  return ArcPolygon2.fromSegments([
    ...rightSegments,
    new Line2(rightSegments[rightSegments.length - 1]!.to, leftSegments[0]!.from),
    ...leftSegments,
    new Line2(leftSegments[leftSegments.length - 1]!.to, rightSegments[0]!.from),
  ]);
}
