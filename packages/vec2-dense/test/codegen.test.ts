import { describe, expect, test } from 'bun:test';
import { createRecorder } from '@dirty-geometry/vec2/recording/recorder';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { recordPlate } from '@dirty-geometry/vec2/examples/definitions/plate';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { definitionToTypeScript } from '../src/codegen';
import { normaliseDefinition } from '../src/convert';
import { runTypeScript, TypeScriptRunError } from '../src/run';

function recordMixed(): Definition {
  const rec = createRecorder();
  const { Vec2: V, Polygon2, Boolean2, Interval2, Epsilon } = rec.lib;
  const a = new V(0, 0);
  const square = new Polygon2([a, new V(2, 0), new V(2, 2), new V(0, 2)]);
  rec.output('union', Boolean2.union([square], { slack: Epsilon.preferIn }).polygons);
  rec.output("it's", new Interval2(-1, Infinity));
  rec.output('mesh', rec.lib.ops.constrainedDelaunay([a, new V(1, 0), new V(0, 1)], [[0, 1]]));
  rec.output('stored', V.center(new Vec2(2, 4), a));
  rec.output('from', square.segments()[0]!.from);
  return rec.definition();
}

describe('TypeScript round trip', () => {
  test.each([
    ['plate', recordPlate],
    ['mixed', recordMixed],
  ])('%s: generated code records the same definition', async (_, record) => {
    const definition = record();
    const code = definitionToTypeScript(definition);
    const { definition: rerun } = await runTypeScript(code);
    expect(normaliseDefinition(rerun)).toEqual(normaliseDefinition(definition));
  });

  test('editing the code changes the definition', async () => {
    const code = definitionToTypeScript(recordPlate()).replace("rec.param('width', 6)", "rec.param('width', 8)");
    const { definition } = await runTypeScript(code);
    expect(definition.params.width?.value).toEqual({ lit: 8 });
  });

  test('loops, helpers and type annotations are allowed; loops are unrolled', async () => {
    const { definition } = await runTypeScript(`
      const rec = createRecorder();
      const { Vec2, Polygon2 } = rec.lib;
      const corner = (x: number, y: number): Vec2 => new Vec2(x, y);
      const points: Vec2[] = [];
      for (let i = 0; i < 5; i++) points.push(corner(Math.cos(i), Math.sin(i)));
      rec.output('pentagon', new Polygon2(points));
    `);
    expect(definition.nodes.filter((node) => node.op === 'Vec2.new')).toHaveLength(5);
  });

  test('errors carry the TypeScript line', async () => {
    await expect(runTypeScript('const rec = createRecorder();\nconst x = ;')).rejects.toThrow(/line 2/);
    const runtime = runTypeScript('const rec = createRecorder();\n\nrec.lib.Vec2.nope();');
    await expect(runtime).rejects.toBeInstanceOf(TypeScriptRunError);
    await expect(runtime).rejects.toThrow(/line 3/);
    await expect(runTypeScript("import { Vec2 } from 'x';")).rejects.toThrow(/imports/);
    await expect(runTypeScript('const x = 1;')).rejects.toThrow(/createRecorder/);
  });
});
