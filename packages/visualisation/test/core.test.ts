import { describe, expect, test } from 'bun:test';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { clipInfiniteLineToDisplayFrame, FRAME_MAX, FRAME_MIN } from '../src/core/frame';
import { demoLibraries, demosFor, findDemo, isDemoLibrary, visualisationMetas } from '../src/meta';
import { buildScenarioGridLayout, fitZoom, minZoomFor } from '../src/core/scenarioGrid';

describe('scenario grid layout', () => {
  test('cell keys stay unique when scenario names repeat across rows (V3)', () => {
    const row = [{ name: 'Overlapping squares' }, { name: 'Disjoint squares' }];
    const keys = buildScenarioGridLayout([row, row]).cells.map((cell) => cell.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('the zoom floor never exceeds the fitted zoom of a tall grid (V4)', () => {
    const tall = buildScenarioGridLayout(Array.from({ length: 30 }, (_, i) => [{ name: `row ${i}` }]));
    const fitted = fitZoom({ width: 1200, height: 800 }, tall);
    expect(fitted).toBeLessThan(20);
    expect(minZoomFor(fitted)).toBeLessThan(fitted);
    expect(minZoomFor(100)).toBe(20);
  });
});

describe('display frame clipping (V6)', () => {
  test('a line without a direction is not drawn', () => {
    expect(clipInfiniteLineToDisplayFrame(new Vec2(0, 0), new Vec2(0, 0))).toBeNull();
  });

  test('a diagonal through the origin spans the frame square', () => {
    const [from, to] = clipInfiniteLineToDisplayFrame(new Vec2(0, 0), new Vec2(1, 1))!;
    expect([from.x, from.y, to.x, to.y]).toEqual([FRAME_MIN, FRAME_MIN, FRAME_MAX, FRAME_MAX]);
  });
});

describe('demo catalogue', () => {
  test('every demo id is a URL segment, unique within its library', () => {
    for (const library of demoLibraries) {
      const ids = demosFor(library).map((meta) => meta.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(/^[a-z0-9-]+$/);
        expect(findDemo(library, id)?.library).toBe(library);
      }
    }
    expect(visualisationMetas.every((meta) => isDemoLibrary(meta.library))).toBe(true);
    expect(findDemo('vec2', 'no-such-demo')).toBeUndefined();
  });
});
