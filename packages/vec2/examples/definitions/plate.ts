/**
 * A recorded definition: a rectangular plate with a round hole, triangulated.
 *
 * Every dimension is a named param and flows through vec2 operations only (the hole's vertices come from
 * `Circle2#evaluate`, its centre from `Vec2#scale`), so replaying with new params moves everything.
 */
import { createRecorder } from '../../src/recording/recorder';
import type { Definition } from '../../src/recording/definition';

export type PlateParams = { width: number; height: number; holeRadius: number; holeX: number };

export const plateDefaults: PlateParams = { width: 6, height: 4, holeRadius: 1, holeX: 0.5 };

/** Number of vertices on the hole; a loop count, so it is fixed when the definition is recorded. */
export const PLATE_HOLE_SEGMENTS = 16;

export function recordPlate(values: PlateParams = plateDefaults): Definition {
  const rec = createRecorder({ strict: true });
  const { Vec2, Polygon2, Circle2, Boolean2 } = rec.lib;
  const width = rec.param('width', values.width);
  const height = rec.param('height', values.height);
  const holeRadius = rec.param('holeRadius', values.holeRadius);
  const holeX = rec.param('holeX', values.holeX);

  const origin = new Vec2(0, 0);
  const outer = new Polygon2([origin, new Vec2(width, 0), new Vec2(width, height), new Vec2(0, height)]);

  // The hole sits at (holeX · width, height / 2): both scale with the plate.
  const centre = new Vec2(width, 0).scale(holeX).add(new Vec2(0, height).scale(0.5));
  const circle = new Circle2(centre, holeRadius);
  const holeVertices = Array.from({ length: PLATE_HOLE_SEGMENTS }, (_, i) =>
    circle.evaluate((2 * Math.PI * i) / PLATE_HOLE_SEGMENTS),
  );
  const hole = new Polygon2(holeVertices);

  const result = Boolean2.subtract([outer], hole, { mesh: true });
  rec.output('plate', result.polygons);
  if (result.triMesh) rec.output('mesh', result.triMesh);
  rec.output('outline', outer);
  rec.output('hole', hole);
  rec.output('area', outer.area());
  return rec.definition();
}
