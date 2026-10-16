'use client';

import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import {
  cdtBasicScenarios,
  cdtComplexScenarios,
  cdtShapeScenarios,
  evaluateCdtScenario,
  type CdtScenario,
} from '@dirty-geometry/vec2/examples/constrained-delaunay/scenarios';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';

export const cdtVisualisationMeta: VisualisationMeta = {
  id: 'constrained-delaunay',
  label: 'Constrained Delaunay',
  title: 'Constrained Delaunay',
  description:
    'Rows: basic → shape collections → large / self-intersecting cases. Blue = triangulation; purple = input constraints (crossings are split automatically).',
  legend: [
    { color: '#4da3ff', label: 'Triangle edge', shape: 'line' },
    { color: '#c77dff', label: 'Constraint (input)', shape: 'line' },
    { color: '#ffb347', label: 'Vertex' },
  ],
};

const cdtScenarioRows = [cdtBasicScenarios, cdtShapeScenarios, cdtComplexScenarios] as const;

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function CdtScenarioVisual({ scenario, offset }: { scenario: CdtScenario; offset: Vec2 }) {
  // Triangulating is the expensive part; redo it only when the scenario changes.
  const { mesh, fit, triangleEdges } = useMemo(() => {
    const mesh = evaluateCdtScenario(scenario);
    const fitPoints =
      mesh.vertices.length > 0
        ? mesh.vertices
        : [...scenario.points, ...scenario.constraintSegments.flatMap((segment) => [segment.from, segment.to])];
    const fit = fitPointsToFrame(fitPoints);

    const triangleEdges: [number, number][] = [];
    const seen = new Set<string>();

    for (const [a, b, c] of mesh.triangles) {
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as [number, number][]) {
        const key = edgeKey(u, v);
        if (seen.has(key)) continue;
        seen.add(key);
        triangleEdges.push([u, v]);
      }
    }

    return { mesh, fit, triangleEdges };
  }, [scenario]);

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {/* Triangulation first */}
      {triangleEdges.map(([u, v], index) => (
        <Line
          key={`edge-${index}`}
          points={[vec2ToTuple(fit(mesh.vertices[u]!), offset), vec2ToTuple(fit(mesh.vertices[v]!), offset)]}
          color='#4da3ff'
          lineWidth={1.25}
        />
      ))}

      {/* Input constraints on top — geometric overlay, not mesh-edge matching */}
      {scenario.constraintSegments.map((segment, index) => (
        <Line
          key={`constraint-${index}`}
          points={[vec2ToTuple(fit(segment.from), offset), vec2ToTuple(fit(segment.to), offset)]}
          color='#c77dff'
          lineWidth={2.5}
        />
      ))}

      {mesh.vertices.map((vertex, index) => (
        <mesh key={`v-${index}`} position={vec2ToTuple(fit(vertex), offset)}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color='#ffb347' />
        </mesh>
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-32 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {mesh.vertices.length} pts · {mesh.triangles.length} tris
          </div>
          <div className='text-purple-300/90'>{scenario.constraintSegments.length} input constraints</div>
        </div>
      </Html>
    </group>
  );
}

export function ConstrainedDelaunayVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={cdtScenarioRows}
      renderCell={(scenario, offset) => <CdtScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default ConstrainedDelaunayVisualisation;
