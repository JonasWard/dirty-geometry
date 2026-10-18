/** Starting definitions for the playground. */
import type { DefinitionV3 as Definition } from '@dirty-geometry/vec2/recording/v3';
import { createRecorder } from '@dirty-geometry/vec2/recording/recorder';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';

function lineAndPoint(): Definition {
  const rec = createRecorder();
  const { Vec2, Line2 } = rec.lib;
  const t = rec.param('t', 0.25);
  const line = new Line2(new Vec2(-2, -1), new Vec2(3, 2));
  rec.output('line', line);
  rec.output('point', line.evaluate(t));
  return rec.definition();
}

function twoSquares(): Definition {
  const rec = createRecorder();
  const { Vec2, Polygon2, Boolean2 } = rec.lib;
  const size = rec.param('size', 3);
  const a = new Polygon2([new Vec2(0, 0), new Vec2(size, 0), new Vec2(size, size), new Vec2(0, size)]);
  const b = new Polygon2([new Vec2(1.5, 1.5), new Vec2(4.5, 1.5), new Vec2(4.5, 4.5), new Vec2(1.5, 4.5)]);
  rec.output('a', a);
  rec.output('b', b);
  rec.output('union', Boolean2.union([a, b]).polygons);
  return rec.definition();
}

export const STARTERS: readonly { id: string; label: string; build: () => Definition }[] = [
  { id: 'plate', label: 'Plate with a hole', build: recordPlate },
  { id: 'line', label: 'Line and a point on it', build: lineAndPoint },
  { id: 'squares', label: 'Union of two squares', build: twoSquares },
];
