'use client';

import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  edgeSubgraphCycleScenarios,
  edgeSubgraphPathScenarios,
  edgeSubgraphPeelScenarios,
  evaluateEdgeSubgraph,
  type EdgeSubgraphScenario,
} from '@dirty-geometry/graph/examples/edge-subgraph/scenarios';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { GraphResultCell } from '../shared/GraphResultCell';

const rows = [edgeSubgraphCycleScenarios, edgeSubgraphPeelScenarios, edgeSubgraphPathScenarios] as const;

function EdgeSubgraphCell({ scenario, offset }: { scenario: EdgeSubgraphScenario; offset: Vec2 }) {
  const result = useMemo(() => evaluateEdgeSubgraph(scenario), [scenario]);
  return <GraphResultCell name={scenario.name} spec={scenario.spec} result={result} offset={offset} />;
}

export function EdgeSubgraphVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={rows}
      renderCell={(scenario, offset) => <EdgeSubgraphCell scenario={scenario} offset={offset} />}
    />
  );
}

export default EdgeSubgraphVisualisation;
