import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { CELL_PITCH, gridOffset } from './frame';

export type NamedScenario = { name: string };

export type ScenarioGridCell<T extends NamedScenario = NamedScenario> = {
  key: string;
  scenario: T;
  offset: Vec2;
};

export type ScenarioGridLayout<T extends NamedScenario = NamedScenario> = {
  columns: number;
  totalRows: number;
  gridWidth: number;
  gridHeight: number;
  cameraCenterX: number;
  cameraCenterY: number;
  cells: ScenarioGridCell<T>[];
};

export type ScenarioGridOptions = {
  columns?: number;
  padding?: number;
  zoomScale?: number;
  /** Multiplier for cell pitch (default 1). Use >1 for larger cells (e.g. wall storeys). */
  cellScale?: number;
};

/** Lay out scenario rows on a fixed-column grid and compute orthographic camera bounds. */
export function buildScenarioGridLayout<T extends NamedScenario>(
  scenarioRows: readonly (readonly T[])[],
  { columns = 4, padding = 4, cellScale = 1 }: ScenarioGridOptions = {},
): ScenarioGridLayout<T> {
  const pitch = CELL_PITCH * cellScale;
  let rowOffset = 0;
  const cells: ScenarioGridCell<T>[] = [];

  for (const row of scenarioRows) {
    for (let index = 0; index < row.length; index++) {
      const scenario = row[index]!;
      const base = gridOffset(index, columns, rowOffset);
      cells.push({
        key: scenario.name,
        scenario,
        offset: new Vec2(base.x * cellScale, base.y * cellScale),
      });
    }

    rowOffset += Math.ceil(row.length / columns);
  }

  const totalRows = rowOffset;
  const spanRows = Math.max(totalRows - 1, 0);
  const gridWidth = (columns - 1) * pitch + padding * cellScale;
  const gridHeight = spanRows * pitch + padding * cellScale;
  const cameraCenterX = ((columns - 1) * pitch) / 2;
  const cameraCenterY = -(spanRows * pitch) / 2;

  return { columns, totalRows, gridWidth, gridHeight, cameraCenterX, cameraCenterY, cells };
}
