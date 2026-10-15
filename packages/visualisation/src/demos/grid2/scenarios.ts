import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Frame2 } from '@dirty-geometry/vec2/core/frame2';
import { Axis } from '@dirty-geometry/vec2/grid/core/grid-axis';
import { GridCell2 } from '@dirty-geometry/vec2/grid/core/grid-cell2';
import { Grid2 } from '@dirty-geometry/vec2/grid/core/grid2';
import { GridLine2 } from '@dirty-geometry/vec2/grid/regions/grid-line2';
import { GridPolyline2 } from '@dirty-geometry/vec2/grid/regions/grid-polyline2';
import { GridPolygon2 } from '@dirty-geometry/vec2/grid/regions/grid-polygon2';
import { GridRectangle2 } from '@dirty-geometry/vec2/grid/regions/grid-rectangle2';
import type { GridGeometry2 } from '@dirty-geometry/vec2/grid/regions/kinds';
import { GridCell2Collection } from '@dirty-geometry/vec2/grid/regions/grid-cell2-collection';
import { gridLineExamples, gridPolygonExamples } from '@dirty-geometry/vec2/examples/grid/geometry-examples';
import { gridWorldLines } from '../../geometry/display/grid/shared';

export type Grid2SetOp = 'intersection' | 'difference' | 'xor';

export type Grid2ChainOp = 'union' | 'intersection' | 'difference' | 'xor';

export type Grid2Scenario = {
  name: string;
  grid: Grid2;
  geometry: GridGeometry2;
  columnCount: number;
  rowCount: number;
};

export type Grid2SetOpScenario = {
  name: string;
  operation: Grid2SetOp;
  grid: Grid2;
  left: GridGeometry2;
  right: GridGeometry2;
  columnCount: number;
  rowCount: number;
};

export type Grid2ChainScenario = {
  name: string;
  expression: string;
  grid: Grid2;
  operands: GridGeometry2[];
  operations: Grid2ChainOp[];
  columnCount: number;
  rowCount: number;
};

export type Grid2UnionIterateScenario = {
  name: string;
  expression: string;
  grid: Grid2;
  geometries: GridGeometry2[];
  columnCount: number;
  rowCount: number;
};

export function evaluateGridScenario(scenario: Grid2Scenario) {
  return scenario.geometry.toCellCollection();
}

export function evaluateSetOpScenario(scenario: Grid2SetOpScenario): GridCell2Collection {
  const left = scenario.left.toCellCollection();
  const right = scenario.right.toCellCollection();

  switch (scenario.operation) {
    case 'intersection':
      return GridCell2Collection.intersection(left, right);
    case 'difference':
      return GridCell2Collection.difference(left, right);
    case 'xor':
      return GridCell2Collection.xor(left, right);
  }
}

export function evaluateChainScenario(scenario: Grid2ChainScenario): GridCell2Collection {
  if (scenario.operands.length === 0) {
    return new GridCell2Collection();
  }

  let result = scenario.operands[0]!.toCellCollection();

  for (let i = 0; i < scenario.operations.length; i++) {
    const next = scenario.operands[i + 1]!.toCellCollection();

    switch (scenario.operations[i]) {
      case 'union':
        result = GridCell2Collection.union(result, next);
        break;
      case 'intersection':
        result = result.intersect(next);
        break;
      case 'difference':
        result = result.subtract(next);
        break;
      case 'xor':
        result = result.xor(next);
        break;
    }
  }

  return result;
}

/** Fold geometries into one collection by iterating and unioning each `toCellCollection()`. */
export function unionGridGeometries(geometries: readonly GridGeometry2[]): GridCell2Collection {
  let result = new GridCell2Collection();
  for (const geometry of geometries) {
    result = GridCell2Collection.union(result, geometry.toCellCollection());
  }
  return result;
}

export function evaluateUnionIterateScenario(scenario: Grid2UnionIterateScenario): GridCell2Collection {
  return unionGridGeometries(scenario.geometries);
}

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

const uniformGrid = new Grid2({ frame: Frame2.worldXY() });

export const grid2LineScenarios: Grid2Scenario[] = [
  {
    name: 'Horizontal line',
    grid: uniformGrid,
    geometry: new GridLine2(new GridCell2(0, 2), new GridCell2(4, 2)),
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'Vertical line',
    grid: uniformGrid,
    geometry: new GridLine2(new GridCell2(2, 0), new GridCell2(2, 4)),
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'Diagonal line',
    grid: uniformGrid,
    geometry: new GridLine2(new GridCell2(0, 0), new GridCell2(4, 4)),
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'Steep diagonal',
    grid: uniformGrid,
    geometry: new GridLine2(new GridCell2(0, 4), new GridCell2(4, 0)),
    columnCount: 5,
    rowCount: 5,
  },
];

export const grid2BresenhamLineScenarios: Grid2Scenario[] = [
  {
    name: 'Shallow slope',
    grid: uniformGrid,
    geometry: gridLineExamples.shallowSlope,
    columnCount: 7,
    rowCount: 3,
  },
  {
    name: 'Steep slope',
    grid: uniformGrid,
    geometry: gridLineExamples.steepSlope,
    columnCount: 3,
    rowCount: 7,
  },
  {
    name: 'Gentle rise',
    grid: uniformGrid,
    geometry: gridLineExamples.gentleRise,
    columnCount: 8,
    rowCount: 5,
  },
  {
    name: 'Backward shallow',
    grid: uniformGrid,
    geometry: gridLineExamples.backwardShallow,
    columnCount: 8,
    rowCount: 5,
  },
  {
    name: 'Degenerate point',
    grid: uniformGrid,
    geometry: gridLineExamples.degeneratePoint,
    columnCount: 5,
    rowCount: 5,
  },
];

const variableGrid = new Grid2().setCustomWidth(1, 2).setCustomWidth(3, 0.5).setCustomHeight(2, 2);

const variableGridColumns = 4;
const variableGridRows = 4;

const stripedGrid = new Grid2({
  u: Axis.custom(1, {
    0: 0.6,
    1: 2,
    2: 0.6,
    3: 2,
    4: 0.6,
  }),
  v: Axis.custom(1, {
    0: 0.75,
    1: 1.75,
    2: 0.75,
    3: 1.75,
    4: 0.75,
  }),
});

const stripedGridColumns = 5;
const stripedGridRows = 5;

export const grid2VariableScenarios: Grid2Scenario[] = [
  {
    name: 'Variable grid rect',
    grid: variableGrid,
    geometry: new GridRectangle2(new GridCell2(0, 0), new GridCell2(3, 3)),
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Variable grid line',
    grid: variableGrid,
    geometry: new GridLine2(new GridCell2(0, 0), new GridCell2(3, 3)),
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Variable grid polyline',
    grid: variableGrid,
    geometry: new GridPolyline2([
      new GridCell2(0, 0),
      new GridCell2(1, 0),
      new GridCell2(1, 2),
      new GridCell2(3, 2),
      new GridCell2(3, 3),
    ]),
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Variable grid polygon',
    grid: variableGrid,
    geometry: new GridPolygon2([
      new GridCell2(0, 0),
      new GridCell2(2, 0),
      new GridCell2(2, 1),
      new GridCell2(3, 1),
      new GridCell2(3, 3),
      new GridCell2(0, 3),
    ]),
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Striped columns rect',
    grid: stripedGrid,
    geometry: new GridRectangle2(new GridCell2(0, 0), new GridCell2(4, 4)),
    columnCount: stripedGridColumns,
    rowCount: stripedGridRows,
  },
  {
    name: 'Striped columns polygon',
    grid: stripedGrid,
    geometry: new GridPolygon2([
      new GridCell2(0, 0),
      new GridCell2(3, 0),
      new GridCell2(3, 2),
      new GridCell2(1, 2),
      new GridCell2(1, 4),
      new GridCell2(0, 4),
    ]),
    columnCount: stripedGridColumns,
    rowCount: stripedGridRows,
  },
  {
    name: 'Striped columns polyline',
    grid: stripedGrid,
    geometry: new GridPolyline2([new GridCell2(0, 2), new GridCell2(2, 2), new GridCell2(2, 0), new GridCell2(4, 0)]),
    columnCount: stripedGridColumns,
    rowCount: stripedGridRows,
  },
];

export const grid2PolylineScenarios: Grid2Scenario[] = [
  {
    name: 'Open polyline',
    grid: uniformGrid,
    geometry: new GridPolyline2([new GridCell2(0, 1), new GridCell2(2, 1), new GridCell2(2, 3), new GridCell2(4, 3)]),
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'L-shape polygon',
    grid: uniformGrid,
    geometry: new GridPolygon2([
      new GridCell2(0, 0),
      new GridCell2(3, 0),
      new GridCell2(3, 1),
      new GridCell2(1, 1),
      new GridCell2(1, 3),
      new GridCell2(0, 3),
    ]),
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'Filled rectangle',
    grid: uniformGrid,
    geometry: new GridRectangle2(new GridCell2(1, 1), new GridCell2(3, 2)),
    columnCount: 5,
    rowCount: 5,
  },
];

export const grid2ConcavePolygonScenarios: Grid2Scenario[] = [
  {
    name: 'L-shape',
    grid: uniformGrid,
    geometry: gridPolygonExamples.lShape,
    columnCount: 3,
    rowCount: 3,
  },
  {
    name: 'Concave notch',
    grid: uniformGrid,
    geometry: gridPolygonExamples.concaveNotch,
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'U-shape cavity',
    grid: uniformGrid,
    geometry: gridPolygonExamples.uShape,
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'H-plate',
    grid: uniformGrid,
    geometry: gridPolygonExamples.hPlate,
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'Arrowhead',
    grid: uniformGrid,
    geometry: gridPolygonExamples.arrowhead,
    columnCount: 5,
    rowCount: 5,
  },
];

const uniformGridWithRotatedFrame = uniformGrid.clone();
uniformGridWithRotatedFrame.frame = new Frame2(Vec2.origin(), new Vec2(1, 0.3), new Vec2(-0.2, 1));

export const grid2RotatedFrameScenarios: Grid2Scenario[] = [
  {
    name: 'Rotated frame line',
    grid: uniformGridWithRotatedFrame,
    geometry: new GridLine2(new GridCell2(0, 0), new GridCell2(4, 2)),
    columnCount: 5,
    rowCount: 5,
  },
  {
    name: 'Rotated frame polygon',
    grid: uniformGridWithRotatedFrame,
    geometry: new GridPolygon2([new GridCell2(1, 1), new GridCell2(3, 1), new GridCell2(3, 3), new GridCell2(1, 3)]),
    columnCount: 5,
    rowCount: 5,
  },
];

export const grid2ScenarioRows = [
  grid2LineScenarios,
  grid2VariableScenarios,
  grid2PolylineScenarios,
  grid2RotatedFrameScenarios,
] as const;

const setOpGrid = new Grid2();
setOpGrid.frame = Frame2.worldXY();
const setOpColumns = 7;
const setOpRows = 6;

const hPlate = new GridPolygon2([
  new GridCell2(0, 1),
  new GridCell2(0, 4),
  new GridCell2(1, 4),
  new GridCell2(1, 3),
  new GridCell2(3, 3),
  new GridCell2(3, 4),
  new GridCell2(4, 4),
  new GridCell2(4, 1),
  new GridCell2(3, 1),
  new GridCell2(3, 0),
  new GridCell2(1, 0),
  new GridCell2(1, 1),
]);

const lWing = new GridPolygon2([
  new GridCell2(0, 0),
  new GridCell2(4, 0),
  new GridCell2(4, 1),
  new GridCell2(2, 1),
  new GridCell2(2, 4),
  new GridCell2(0, 4),
]);

const stairPolyline = new GridPolyline2([
  new GridCell2(0, 5),
  new GridCell2(1, 4),
  new GridCell2(2, 3),
  new GridCell2(3, 2),
  new GridCell2(4, 1),
  new GridCell2(5, 0),
  new GridCell2(6, 0),
]);

export const grid2IntersectionScenarios: Grid2SetOpScenario[] = [
  {
    name: 'H-plate ∩ spine',
    operation: 'intersection',
    grid: setOpGrid,
    left: hPlate,
    right: new GridRectangle2(new GridCell2(2, 0), new GridCell2(2, 5)),
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'L-wing ∩ stair',
    operation: 'intersection',
    grid: setOpGrid,
    left: lWing,
    right: stairPolyline,
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
];

export const grid2DifferenceScenarios: Grid2SetOpScenario[] = [
  {
    name: 'H-plate − cross',
    operation: 'difference',
    grid: setOpGrid,
    left: hPlate,
    right: new GridRectangle2(new GridCell2(1, 1), new GridCell2(3, 3)),
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'Block − L-wing',
    operation: 'difference',
    grid: setOpGrid,
    left: new GridRectangle2(new GridCell2(0, 0), new GridCell2(5, 4)),
    right: lWing,
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
];

export const grid2XorScenarios: Grid2SetOpScenario[] = [
  {
    name: 'Rects △ offset',
    operation: 'xor',
    grid: setOpGrid,
    left: new GridRectangle2(new GridCell2(0, 0), new GridCell2(4, 4)),
    right: new GridRectangle2(new GridCell2(2, 1), new GridCell2(6, 4)),
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'H-plate △ bar',
    operation: 'xor',
    grid: setOpGrid,
    left: hPlate,
    right: new GridRectangle2(new GridCell2(0, 2), new GridCell2(5, 2)),
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
];

export const grid2SetOpScenarioRows = [
  grid2IntersectionScenarios,
  grid2DifferenceScenarios,
  grid2XorScenarios,
] as const;

export const grid2VariableSetOpScenarios: Grid2SetOpScenario[] = [
  {
    name: 'Wide col ∩ spine',
    operation: 'intersection',
    grid: variableGrid,
    left: new GridRectangle2(new GridCell2(0, 0), new GridCell2(3, 3)),
    right: new GridRectangle2(new GridCell2(1, 0), new GridCell2(1, 3)),
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Variable − cross',
    operation: 'difference',
    grid: variableGrid,
    left: new GridPolygon2([new GridCell2(0, 0), new GridCell2(3, 0), new GridCell2(3, 3), new GridCell2(0, 3)]),
    right: new GridRectangle2(new GridCell2(1, 1), new GridCell2(2, 2)),
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Striped △ offset',
    operation: 'xor',
    grid: stripedGrid,
    left: new GridRectangle2(new GridCell2(0, 0), new GridCell2(3, 3)),
    right: new GridRectangle2(new GridCell2(2, 1), new GridCell2(4, 4)),
    columnCount: stripedGridColumns,
    rowCount: stripedGridRows,
  },
  {
    name: 'Striped polyline ∩ bar',
    operation: 'intersection',
    grid: stripedGrid,
    left: new GridPolyline2([new GridCell2(0, 1), new GridCell2(2, 1), new GridCell2(2, 3), new GridCell2(4, 3)]),
    right: new GridRectangle2(new GridCell2(0, 2), new GridCell2(4, 2)),
    columnCount: stripedGridColumns,
    rowCount: stripedGridRows,
  },
];

export const grid2VariableSetOpScenarioRows = [grid2VariableSetOpScenarios] as const;

const spine = new GridRectangle2(new GridCell2(2, 0), new GridCell2(2, 5));
const centerCross = new GridRectangle2(new GridCell2(1, 1), new GridCell2(3, 3));
const horizontalBar = new GridRectangle2(new GridCell2(0, 2), new GridCell2(5, 2));
const outerBlock = new GridRectangle2(new GridCell2(0, 0), new GridCell2(5, 4));

export const grid2ChainScenarios: Grid2ChainScenario[] = [
  {
    name: 'H ∩ spine − cross',
    expression: 'H ∩ spine − cross',
    grid: setOpGrid,
    operands: [hPlate, spine, centerCross],
    operations: ['intersection', 'difference'],
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'Block − L ∪ stair △ bar',
    expression: 'block − L ∪ stair △ bar',
    grid: setOpGrid,
    operands: [outerBlock, lWing, stairPolyline, horizontalBar],
    operations: ['difference', 'union', 'xor'],
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'Rects △ spine ∩ bar',
    expression: '(rect △ offset) ∩ bar',
    grid: setOpGrid,
    operands: [
      new GridRectangle2(new GridCell2(0, 0), new GridCell2(4, 4)),
      new GridRectangle2(new GridCell2(2, 1), new GridCell2(6, 4)),
      spine,
      horizontalBar,
    ],
    operations: ['xor', 'intersection', 'intersection'],
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'L ∩ stair △ cross',
    expression: 'L ∩ stair △ cross',
    grid: setOpGrid,
    operands: [lWing, stairPolyline, centerCross],
    operations: ['intersection', 'xor'],
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
];

export const grid2ChainScenarioRows = [grid2ChainScenarios] as const;

export const grid2UnionIterateScenarios: Grid2UnionIterateScenario[] = [
  {
    name: 'Floor plan ∪',
    expression: 'for (g) collection = collection ∪ g',
    grid: setOpGrid,
    geometries: [
      new GridRectangle2(new GridCell2(2, 1), new GridCell2(5, 4)),
      new GridPolyline2([new GridCell2(0, 2), new GridCell2(1, 2), new GridCell2(2, 2), new GridCell2(2, 1)]),
      new GridPolygon2([new GridCell2(0, 3), new GridCell2(2, 3), new GridCell2(2, 5), new GridCell2(0, 5)]),
      new GridRectangle2(new GridCell2(5, 0), new GridCell2(6, 2)),
    ],
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'Site ∪ mixed',
    expression: '∪ rect, polyline, polygon, rect',
    grid: setOpGrid,
    geometries: [
      new GridRectangle2(new GridCell2(0, 0), new GridCell2(3, 2)),
      new GridPolyline2([
        new GridCell2(3, 1),
        new GridCell2(4, 1),
        new GridCell2(5, 2),
        new GridCell2(6, 3),
        new GridCell2(6, 5),
      ]),
      new GridPolygon2([
        new GridCell2(1, 3),
        new GridCell2(4, 3),
        new GridCell2(4, 5),
        new GridCell2(2, 5),
        new GridCell2(1, 4),
      ]),
      new GridRectangle2(new GridCell2(4, 0), new GridCell2(6, 1)),
    ],
    columnCount: setOpColumns,
    rowCount: setOpRows,
  },
  {
    name: 'Variable ∪ mixed',
    expression: '∪ rect, polyline, polygon on custom grid',
    grid: variableGrid,
    geometries: [
      new GridRectangle2(new GridCell2(1, 0), new GridCell2(3, 2)),
      new GridPolyline2([new GridCell2(0, 1), new GridCell2(1, 1), new GridCell2(1, 3), new GridCell2(3, 3)]),
      new GridPolygon2([new GridCell2(0, 2), new GridCell2(0, 3), new GridCell2(2, 3), new GridCell2(2, 2)]),
    ],
    columnCount: variableGridColumns,
    rowCount: variableGridRows,
  },
  {
    name: 'Striped ∪ iterate',
    expression: 'for (g) collection = collection ∪ g',
    grid: stripedGrid,
    geometries: [
      new GridRectangle2(new GridCell2(0, 0), new GridCell2(2, 2)),
      new GridPolyline2([new GridCell2(2, 0), new GridCell2(3, 0), new GridCell2(3, 2), new GridCell2(4, 2)]),
      new GridPolygon2([new GridCell2(1, 3), new GridCell2(4, 3), new GridCell2(4, 4), new GridCell2(1, 4)]),
      new GridRectangle2(new GridCell2(0, 3), new GridCell2(1, 4)),
    ],
    columnCount: stripedGridColumns,
    rowCount: stripedGridRows,
  },
];

export const grid2UnionIterateScenarioRows = [grid2UnionIterateScenarios] as const;
