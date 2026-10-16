/** Frame fitting for the grid2 demo: the points each scenario cell must show. */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { GridCell2 } from '@dirty-geometry/vec2/grid/core/grid-cell2';
import { Grid2 } from '@dirty-geometry/vec2/grid/core/grid2';
import { gridWorldLines } from '../../../geometry/display/grid/shared';
import {
  type Grid2ChainScenario,
  type Grid2Scenario,
  type Grid2SetOpScenario,
  type Grid2UnionIterateScenario,
  evaluateChainScenario,
  evaluateGridScenario,
  evaluateSetOpScenario,
  evaluateUnionIterateScenario,
} from '@dirty-geometry/vec2/examples/grid2/scenarios';

function pushCellWorldExtents(points: Vec2[], grid: Grid2, cells: Iterable<GridCell2>): void {
  for (const cell of cells) {
    const world = grid.cellWorldRect(cell);
    points.push(world.min(), world.max());
  }
}

function pushGridWorldLattice(points: Vec2[], grid: Grid2, columnCount: number, rowCount: number): void {
  for (const { from, to } of gridWorldLines(grid, columnCount, rowCount)) {
    points.push(from, to);
  }
}

export function scenarioAnchorPoints(scenario: Grid2Scenario): Vec2[] {
  const points: Vec2[] = [];
  pushCellWorldExtents(points, scenario.grid, evaluateGridScenario(scenario).toArray());
  pushGridWorldLattice(points, scenario.grid, scenario.columnCount, scenario.rowCount);
  return points;
}

export function setOpScenarioAnchorPoints(scenario: Grid2SetOpScenario): Vec2[] {
  const points: Vec2[] = [];

  for (const geometry of [scenario.left, scenario.right]) {
    pushCellWorldExtents(points, scenario.grid, geometry.toCellCollection().toArray());
  }
  pushCellWorldExtents(points, scenario.grid, evaluateSetOpScenario(scenario).toArray());
  pushGridWorldLattice(points, scenario.grid, scenario.columnCount, scenario.rowCount);
  return points;
}

export function chainScenarioAnchorPoints(scenario: Grid2ChainScenario): Vec2[] {
  const points: Vec2[] = [];

  for (const geometry of scenario.operands) {
    pushCellWorldExtents(points, scenario.grid, geometry.toCellCollection().toArray());
  }
  pushCellWorldExtents(points, scenario.grid, evaluateChainScenario(scenario).toArray());
  pushGridWorldLattice(points, scenario.grid, scenario.columnCount, scenario.rowCount);
  return points;
}

export function unionIterateScenarioAnchorPoints(scenario: Grid2UnionIterateScenario): Vec2[] {
  const points: Vec2[] = [];

  for (const geometry of scenario.geometries) {
    pushCellWorldExtents(points, scenario.grid, geometry.toCellCollection().toArray());
  }
  pushCellWorldExtents(points, scenario.grid, evaluateUnionIterateScenario(scenario).toArray());
  pushGridWorldLattice(points, scenario.grid, scenario.columnCount, scenario.rowCount);
  return points;
}
