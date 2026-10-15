import { Vec2 } from '../src/core/vec2';

function formatVec2(v: Vec2): string {
  return `(${v.x}, ${v.y})`;
}

export function expectClose(actual: number, expected: number, tolerance = 1e-9, info?: string): void {
  if (Math.abs(actual - expected) >= tolerance) {
    const detail = info ? ` — ${info}` : '';
    throw new Error(`Expected ${actual} to be close to ${expected} (tolerance ${tolerance})${detail}`);
  }
}

export function expectVec2Close(actual: Vec2, expected: Vec2, tolerance = 1e-9, info?: string): void {
  const dx = Math.abs(actual.x - expected.x);
  const dy = Math.abs(actual.y - expected.y);

  if (dx >= tolerance || dy >= tolerance) {
    const detail = info ? `\n${info}` : '';
    throw new Error(
      `Expected Vec2 ${formatVec2(actual)} to be close to ${formatVec2(expected)} (tolerance ${tolerance})${detail}`,
    );
  }
}
