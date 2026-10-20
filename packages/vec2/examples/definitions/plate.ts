/**
 * A recorded definition: a rectangular plate with a round hole, triangulated.
 *
 * Every dimension is a named param and flows through vec2 operations only (the plate from its bounds, the hole sampled
 * from its circle, its centre from `Vec2.scale`), so replaying with new params moves everything.
 */
import { createRecorder } from '../../src/recording/recorder';
import type { DefinitionV3 as Definition } from '../../src/recording/v3';

export type PlateParams = { width: number; height: number; holeRadius: number; holeX: number; holeSegments: number };

export const plateDefaults: PlateParams = { width: 6, height: 4, holeRadius: 1, holeX: 0.5, holeSegments: 16 };

export function recordPlate(values: PlateParams = plateDefaults): Definition {
  const rec = createRecorder({ strict: true });
  const { Vec2, Aabb2, Polygon2, Circle2, Boolean2 } = rec.lib;
  const width = rec.param('width', values.width);
  const height = rec.param('height', values.height);
  const holeRadius = rec.param('holeRadius', values.holeRadius);
  const holeX = rec.param('holeX', values.holeX);
  const holeSegments = rec.param('holeSegments', values.holeSegments);

  const outer = Polygon2.fromAabb2(Aabb2.fromMinMax(new Vec2(0, 0), new Vec2(width, height)));
  // The hole sits at (holeX · width, height / 2): both scale with the plate.
  const centre = new Vec2(width, 0).scale(holeX).add(new Vec2(0, height).scale(0.5));
  const hole = Polygon2.fromCircle2(new Circle2(centre, holeRadius), holeSegments);

  const result = Boolean2.subtract([outer], hole, { mesh: true });
  rec.output('plate', result.polygons);
  if (result.triMesh) rec.output('mesh', result.triMesh);
  rec.output('outline', outer);
  rec.output('hole', hole);
  rec.output('area', outer.area());
  return rec.definition();
}
