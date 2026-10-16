'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { evaluateGridScenario, evaluateChainScenario, evaluateSetOpScenario, evaluateUnionIterateScenario, grid2ChainScenarioRows, grid2LineScenarios, grid2BresenhamLineScenarios, grid2ConcavePolygonScenarios, grid2PolylineScenarios, grid2RotatedFrameScenarios, grid2SetOpScenarioRows, grid2UnionIterateScenarioRows, grid2VariableSetOpScenarioRows, grid2VariableScenarios, type Grid2Scenario, type Grid2ChainScenario, type Grid2SetOpScenario, type Grid2UnionIterateScenario } from '@dirty-geometry/vec2/examples/grid2/scenarios';
import { scenarioAnchorPoints, chainScenarioAnchorPoints, setOpScenarioAnchorPoints, unionIterateScenarioAnchorPoints } from './frame';
import { GRID2_COLORS, chainOperandColor, earthToneAt, setOpOperandColor } from '../../geometry/display/grid/colors';
import { fitPointsToFrame, frameCorners, labelPosition } from '../../core/frame';
import { GridGeometryRender } from '../../geometry/components/GridGeometryRender';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';

type Grid2AnyScenario = Grid2Scenario | Grid2SetOpScenario | Grid2ChainScenario | Grid2UnionIterateScenario;

const grid2ScenarioRows: readonly (readonly Grid2AnyScenario[])[] = [
  grid2LineScenarios,
  grid2BresenhamLineScenarios,
  grid2VariableScenarios,
  grid2PolylineScenarios,
  grid2ConcavePolygonScenarios,
  grid2RotatedFrameScenarios,
  ...grid2SetOpScenarioRows,
  ...grid2VariableSetOpScenarioRows,
  ...grid2UnionIterateScenarioRows,
  ...grid2ChainScenarioRows,
];

function Grid2ScenarioVisual({ scenario, offset }: { scenario: Grid2Scenario; offset: Vec2 }) {
  const fit = useMemo(() => fitPointsToFrame(scenarioAnchorPoints(scenario)), [scenario]);
  const cells = useMemo(() => evaluateGridScenario(scenario), [scenario]);

  return (
    <group>
      <Line points={frameCorners(offset)} color={GRID2_COLORS.frame} lineWidth={1} />

      <GridGeometryRender
        grid={scenario.grid}
        geometry={scenario.geometry}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        latticeColor={GRID2_COLORS.lattice}
        fillColor={GRID2_COLORS.geometryFill}
        outlineColor={GRID2_COLORS.geometryOutline}
        markerColor={GRID2_COLORS.geometryMarker}
        keyPrefix={scenario.name}
      />

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-36 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{cells.size()} cells</div>
        </div>
      </Html>
    </group>
  );
}

function Grid2SetOpVisual({ scenario, offset }: { scenario: Grid2SetOpScenario; offset: Vec2 }) {
  const fit = useMemo(() => fitPointsToFrame(setOpScenarioAnchorPoints(scenario)), [scenario]);
  const result = useMemo(() => evaluateSetOpScenario(scenario), [scenario]);
  const leftSize = scenario.left.toCellCollection().size();
  const rightSize = scenario.right.toCellCollection().size();

  return (
    <group>
      <Line points={frameCorners(offset)} color={GRID2_COLORS.frame} lineWidth={1} />

      <GridGeometryRender
        grid={scenario.grid}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        latticeColor={GRID2_COLORS.lattice}
        keyPrefix={`${scenario.name}-lattice`}
      />

      <GridGeometryRender
        grid={scenario.grid}
        geometry={scenario.left}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        showLattice={false}
        outlineColor={setOpOperandColor('left', scenario.operation)}
        fillColor={setOpOperandColor('left', scenario.operation)}
        fillOpacity={GRID2_COLORS.operandFillOpacity}
        keyPrefix={`${scenario.name}-left`}
      />

      <GridGeometryRender
        grid={scenario.grid}
        geometry={scenario.right}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        showLattice={false}
        outlineColor={setOpOperandColor('right', scenario.operation)}
        fillColor={setOpOperandColor('right', scenario.operation)}
        fillOpacity={GRID2_COLORS.operandFillOpacity}
        keyPrefix={`${scenario.name}-right`}
      />

      <GridGeometryRender
        grid={scenario.grid}
        geometry={result}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        showLattice={false}
        fillColor={GRID2_COLORS.resultFill}
        fillOpacity={GRID2_COLORS.resultOpacity}
        keyPrefix={`${scenario.name}-result`}
      />

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-40 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{scenario.operation}</div>
          <div className='text-white/50'>
            {leftSize} | {rightSize} → {result.size()}
          </div>
        </div>
      </Html>
    </group>
  );
}

function Grid2ChainVisual({ scenario, offset }: { scenario: Grid2ChainScenario; offset: Vec2 }) {
  const fit = useMemo(() => fitPointsToFrame(chainScenarioAnchorPoints(scenario)), [scenario]);
  const result = useMemo(() => evaluateChainScenario(scenario), [scenario]);

  return (
    <group>
      <Line points={frameCorners(offset)} color={GRID2_COLORS.frame} lineWidth={1} />

      <GridGeometryRender
        grid={scenario.grid}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        latticeColor={GRID2_COLORS.lattice}
        keyPrefix={`${scenario.name}-lattice`}
      />

      {scenario.operands.map((operand, index) => {
        const color = chainOperandColor(index, scenario.operations);
        return (
          <GridGeometryRender
            key={`${scenario.name}-operand-${index}`}
            grid={scenario.grid}

            geometry={operand}
            fit={fit}
            offset={offset}
            columnCount={scenario.columnCount}
            rowCount={scenario.rowCount}
            showLattice={false}
            outlineColor={color}
            fillColor={color}
            fillOpacity={GRID2_COLORS.operandFillOpacity}
            keyPrefix={`${scenario.name}-op-${index}`}
          />
        );
      })}

      <GridGeometryRender
        grid={scenario.grid}
        geometry={result}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        showLattice={false}
        fillColor={GRID2_COLORS.resultFill}
        fillOpacity={GRID2_COLORS.resultOpacity}
        keyPrefix={`${scenario.name}-result`}
      />

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-44 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{scenario.expression}</div>
          <div className='text-white/50'>{result.size()} cells</div>
        </div>
      </Html>
    </group>
  );
}

function Grid2UnionIterateVisual({ scenario, offset }: { scenario: Grid2UnionIterateScenario; offset: Vec2 }) {
  const fit = useMemo(() => fitPointsToFrame(unionIterateScenarioAnchorPoints(scenario)), [scenario]);
  const result = useMemo(() => evaluateUnionIterateScenario(scenario), [scenario]);

  return (
    <group>
      <Line points={frameCorners(offset)} color={GRID2_COLORS.frame} lineWidth={1} />

      <GridGeometryRender
        grid={scenario.grid}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        latticeColor={GRID2_COLORS.lattice}
        keyPrefix={`${scenario.name}-lattice`}
      />

      {scenario.geometries.map((geometry, index) => {
        const color = earthToneAt(index);
        return (
          <GridGeometryRender
            key={`${scenario.name}-geometry-${index}`}
            grid={scenario.grid}

            geometry={geometry}
            fit={fit}
            offset={offset}
            columnCount={scenario.columnCount}
            rowCount={scenario.rowCount}
            showLattice={false}
            outlineColor={color}
            fillColor={color}
            fillOpacity={GRID2_COLORS.operandFillOpacity}
            keyPrefix={`${scenario.name}-g-${index}`}
          />
        );
      })}

      <GridGeometryRender
        grid={scenario.grid}
        geometry={result}
        fit={fit}
        offset={offset}
        columnCount={scenario.columnCount}
        rowCount={scenario.rowCount}
        showLattice={false}
        fillColor={GRID2_COLORS.resultFill}
        fillOpacity={GRID2_COLORS.resultOpacity}
        keyPrefix={`${scenario.name}-result`}
      />

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-44 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>{scenario.expression}</div>
          <div className='text-white/50'>
            {scenario.geometries.length} shapes → {result.size()} cells
          </div>
        </div>
      </Html>
    </group>
  );
}

function isUnionIterateScenario(scenario: Grid2AnyScenario): scenario is Grid2UnionIterateScenario {
  return 'geometries' in scenario;
}

function isChainScenario(scenario: Grid2AnyScenario): scenario is Grid2ChainScenario {
  return 'operands' in scenario;
}

function isSetOpScenario(scenario: Grid2AnyScenario): scenario is Grid2SetOpScenario {
  return 'left' in scenario;
}

export function Grid2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={grid2ScenarioRows}
      renderCell={(scenario, offset) => {
        if (isUnionIterateScenario(scenario)) {
          return <Grid2UnionIterateVisual scenario={scenario} offset={offset} />;
        }
        if (isChainScenario(scenario)) {
          return <Grid2ChainVisual scenario={scenario} offset={offset} />;
        }
        if (isSetOpScenario(scenario)) {
          return <Grid2SetOpVisual scenario={scenario} offset={offset} />;
        }
        return <Grid2ScenarioVisual scenario={scenario} offset={offset} />;
      }}
    />
  );
}
