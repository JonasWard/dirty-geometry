'use client';

import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  cityGraphSpec,
  evaluatePathSearch,
  pathSearchComparisonScenarios,
  pathSearchConstraintScenarios,
  type PathSearchScenario,
} from '@dirty-geometry/graph/examples/path-search/scenarios';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { GraphResultCell } from '../shared/GraphResultCell';

const rows = [pathSearchComparisonScenarios, pathSearchConstraintScenarios] as const;

function PathSearchCell({ scenario, offset }: { scenario: PathSearchScenario; offset: Vec2 }) {
  const result = useMemo(() => evaluatePathSearch(scenario), [scenario]);
  return <GraphResultCell name={scenario.name} spec={cityGraphSpec} result={result} offset={offset} />;
}

export function PathSearchVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={rows}
      renderCell={(scenario, offset) => <PathSearchCell scenario={scenario} offset={offset} />}
    />
  );
}

export default PathSearchVisualisation;
