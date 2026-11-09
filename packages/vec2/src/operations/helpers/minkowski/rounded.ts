import type { Epsilon } from '../../../core/epsilon';
import type { Coordinate, Length } from '../../../core/numbers';
import type { Vec2 } from '../../../core/vec2';
import { sagittaFromSweep } from '../../../geometry/primitives/arc2';
import { ArcPolygon2 } from '../../../geometry/regions/arc-polygon2';

/**
 * A loop from `convexLoop` grown by a disc of `radius`: each edge moved outward, each corner rounded by an arc
 * around the vertex. A corner whose arc would be shorter than `epsilon` is left sharp.
 * @internal
 */
export function roundedConvex(loop: readonly Vec2[], radius: Length, epsilon: Epsilon): ArcPolygon2 {
  const n = loop.length;
  const normals = loop.map((v, i) => outwardNormal(v, loop[(i + 1) % n]!, radius));
  const vertices: Vec2[] = [];
  const sagittas: Coordinate[] = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const corner = loop[next]!;
    const from = corner.add(normals[i]!);
    const to = corner.add(normals[next]!);
    vertices.push(loop[i]!.add(normals[i]!), from);
    sagittas.push(0);
    if (from.distance(to) <= epsilon.value) {
      // Too small to round: the next edge starts here instead.
      vertices.pop();
      continue;
    }
    const sweep = Math.atan2(normals[i]!.crossProduct(normals[next]!), normals[i]!.dot(normals[next]!));
    sagittas.push(sagittaFromSweep(radius, sweep));
  }
  return new ArcPolygon2(vertices, sagittas, epsilon);
}

/**
 * The segment `from → to` grown by a disc of `radius`: a counter-clockwise pill with half-circle ends.
 * `null` for a segment of zero length.
 * @internal
 */
export function capsule(from: Vec2, to: Vec2, radius: Length, epsilon: Epsilon): ArcPolygon2 | null {
  if (from.distance(to) <= epsilon.value) return null;
  const normal = outwardNormal(from, to, radius);
  return new ArcPolygon2(
    [from.add(normal), to.add(normal), to.subtract(normal), from.subtract(normal)],
    [0, -radius, 0, -radius],
    epsilon,
  );
}

/** The right normal of `from → to`, of length `radius`: outward for a counter-clockwise loop. */
function outwardNormal(from: Vec2, to: Vec2, radius: Length): Vec2 {
  return to.subtract(from).unit().perpendicular().scale(-radius);
}
