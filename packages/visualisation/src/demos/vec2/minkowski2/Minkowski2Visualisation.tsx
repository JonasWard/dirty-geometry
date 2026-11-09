'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { ArcPolygon2 } from '@dirty-geometry/vec2/geometry/regions/arc-polygon2';
import type { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import {
  evaluateMinkowskiScenario,
  explainDisc,
  explainSum,
  minkowskiScenarioRows,
  type Minkowski2Scenario,
} from '@dirty-geometry/vec2/examples/minkowski2/scenarios';
import { frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { fitGeometriesToFrame } from '../../../geometry';
import { ContainerInteriorMesh } from '../../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../../geometry/components/GeometryRender';
import { arcChainDisplayPoints, displayChordTolerance } from '../../../geometry/display/shared/arc';

const COLORS = {
  a: '#ffb347',
  b: '#c77dff',
  result: '#7dff7d',
  hole: '#ff7ad9',
  background: '#0b0d12',
} as const;

/** One hue per convex piece; a pair sum takes the hue of its piece of A. */
const PIECE_HUES = ['#4cc9f0', '#f72585', '#ffd166', '#06d6a0', '#ef476f', '#8338ec', '#fb8500', '#90be6d'];
const hue = (index: number) => PIECE_HUES[index % PIECE_HUES.length]!;

/** The intermediate shapes of a step scenario, empty for the others. */
function stepShapes(scenario: Minkowski2Scenario) {
  const empty = {
    pieces: [] as { polygon: Polygon2; color: string }[],
    pairs: [] as { polygon: Polygon2; color: string }[],
    capsules: [] as ArcPolygon2[],
  };
  if (!scenario.stage) return empty;
  if (scenario.stage === 'capsules') return { ...empty, capsules: explainDisc(scenario.a, scenario.radius ?? 0) };
  if (scenario.section !== 'sum') return empty;
  const { piecesA, piecesB, pairs } = explainSum(scenario.a, scenario.b ?? []);
  return {
    ...empty,
    pieces: [
      ...piecesA.map((polygon, i) => ({ polygon, color: hue(i) })),
      ...piecesB.map((polygon, i) => ({ polygon, color: hue(piecesA.length + i) })),
    ],
    pairs: pairs.map(({ pieceA, sum }) => ({ polygon: sum, color: hue(pieceA) })),
    counts: `A: ${piecesA.length} pieces · B: ${piecesB.length} · ${pairs.length} sums`,
  };
}

function MinkowskiCell({ scenario, offset }: { scenario: Minkowski2Scenario; offset: Vec2 }) {
  const { regions, steps, fit, milliseconds } = useMemo(() => {
    const start = performance.now();
    const result = evaluateMinkowskiScenario(scenario);
    const milliseconds = performance.now() - start;
    // Straight results are drawn the same way as arc results.
    const regions = [...(result.regions ?? []), ...result.polygons.map((p) => ArcPolygon2.fromPolygon(p))];
    const steps = stepShapes(scenario);
    // Every stage of one example fits the same frame: the result bounds them all.
    const geometries: Geometry2[] = [...scenario.a, ...(scenario.b ?? []), ...regions, ...steps.capsules];
    return { regions, steps, fit: fitGeometriesToFrame(geometries), milliseconds };
  }, [scenario]);

  // The pieces, pair sums and capsule stages show their step instead of the result.
  const showResult = !scenario.stage || scenario.stage === 'union';

  const outer = regions.filter((region) => region.signedArea() > 0);
  const holes = regions.filter((region) => region.signedArea() < 0);
  const area = regions.reduce((sum, region) => sum + region.signedArea(), 0);
  const outline = (points: readonly Vec2[]) => points.map((point) => vec2ToTuple(fit(point), offset));
  const detail = scenario.section === 'disc' ? `r ${scenario.radius}` : scenario.section;
  const stepLine =
    'counts' in steps
      ? steps.counts
      : scenario.stage === 'capsules'
        ? `${steps.capsules.length} capsules, one per edge`
        : null;

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {/* Result interiors, then holes painted over in the background colour. */}
      {/* Step shapes: convex pieces filled, pair sums and capsules as translucent outlines. */}
      {scenario.stage === 'pieces'
        ? steps.pieces.map(({ polygon, color }, index) => (
            <group key={`piece-${index}`}>
              <ContainerInteriorMesh
                container={polygon}
                fit={fit}
                offset={offset}
                color={color}
                opacity={0.45}
                z={-0.1}
                renderOrder={-2}
              />
              <Line points={outline([...polygon.vertices, polygon.vertices[0]!])} color={color} lineWidth={1.5} />
            </group>
          ))
        : null}
      {scenario.stage === 'pairs' || scenario.stage === 'union'
        ? steps.pairs.map(({ polygon, color }, index) => (
            <group key={`pair-${index}`}>
              {scenario.stage === 'pairs' ? (
                <ContainerInteriorMesh
                  container={polygon}
                  fit={fit}
                  offset={offset}
                  color={color}
                  opacity={0.1}
                  z={-0.1}
                  renderOrder={-2}
                />
              ) : null}
              <Line
                points={outline([...polygon.vertices, polygon.vertices[0]!])}
                color={color}
                lineWidth={scenario.stage === 'pairs' ? 1.25 : 0.75}
                transparent
                opacity={scenario.stage === 'pairs' ? 0.9 : 0.35}
              />
            </group>
          ))
        : null}
      {steps.capsules.map((region, index) => (
        <Line
          key={`capsule-${index}`}
          points={outline(arcChainDisplayPoints(region.segments(), true, displayChordTolerance(fit)))}
          color={hue(index)}
          lineWidth={1.25}
        />
      ))}

      {(showResult ? outer : []).map((region, index) => (
        <ContainerInteriorMesh
          key={`fill-${index}`}
          container={region}
          fit={fit}
          offset={offset}
          color={COLORS.result}
          opacity={0.22}
          z={-0.1}
          renderOrder={-2}
        />
      ))}
      {(showResult ? holes : []).map((region, index) => (
        <ContainerInteriorMesh
          key={`hole-${index}`}
          container={region}
          fit={fit}
          offset={offset}
          color={COLORS.background}
          opacity={1}
          z={-0.09}
          renderOrder={-1}
        />
      ))}

      {scenario.a.map((shape, index) => (
        <GeometryRender
          key={`a-${index}`}
          geometry={shape}
          fit={fit}
          offset={offset}
          color={COLORS.a}
          keyPrefix={`a-${index}`}
          lineWidth={1}
        />
      ))}
      {(scenario.b ?? []).map((shape, index) => (
        <GeometryRender
          key={`b-${index}`}
          geometry={shape}
          fit={fit}
          offset={offset}
          color={COLORS.b}
          keyPrefix={`b-${index}`}
          lineWidth={1}
        />
      ))}

      {(showResult ? regions : []).map((region, index) => (
        <Line
          key={`region-${index}`}
          points={outline(arcChainDisplayPoints(region.segments(), true, displayChordTolerance(fit)))}
          color={region.signedArea() > 0 ? COLORS.result : COLORS.hole}
          lineWidth={2.25}
        />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {detail} · area {area.toFixed(3)} · {milliseconds.toFixed(1)} ms
          </div>
          <div className='text-green-300'>{stepLine ?? `${outer.length} region(s) · ${holes.length} hole(s)`}</div>
        </div>
      </Html>
    </group>
  );
}

export function Minkowski2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={minkowskiScenarioRows}
      renderCell={(scenario, offset) => <MinkowskiCell scenario={scenario} offset={offset} />}
    />
  );
}

export default Minkowski2Visualisation;
