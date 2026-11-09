'use client';

import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { ArcPolygon2 } from '@dirty-geometry/vec2/geometry/regions/arc-polygon2';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import {
  convexDecompositionScenarioRows,
  evaluateConvexDecompositionScenario,
  explainSum,
  type ConvexDecompositionScenario,
} from '@dirty-geometry/vec2/examples/convex-decomposition2/scenarios';
import { frameCorners, labelPosition, vec2ToTuple } from '../../../core/frame';
import { ScenarioGridVisualisation } from '../../../core/ScenarioGridVisualisation';
import { fitGeometriesToFrame } from '../../../geometry';
import { ContainerInteriorMesh } from '../../../geometry/components/ContainerInteriorMesh';
import { GeometryRender } from '../../../geometry/components/GeometryRender';
import { arcChainDisplayPoints, displayChordTolerance } from '../../../geometry/display/shared/arc';

const COLORS = {
  a: '#ffb347',
  b: '#c77dff',
  triangle: '#e8ecf4',
  result: '#7dff7d',
  hole: '#ff7ad9',
  background: '#0b0d12',
} as const;

/** One hue per convex piece; a triangle and a pair sum take the hue of the piece they belong to. */
const PIECE_HUES = ['#4cc9f0', '#f72585', '#ffd166', '#06d6a0', '#ef476f', '#8338ec', '#fb8500', '#90be6d'];
const hue = (index: number) => PIECE_HUES[index % PIECE_HUES.length]!;

type Colored = { polygon: Polygon2; color: string };

/** The index of the piece holding the triangle `corners` (by its centroid), for colouring it like its piece. */
function pieceOf(corners: readonly Vec2[], pieces: readonly Polygon2[]): number {
  const centroid = Vec2.center(...corners);
  return Math.max(
    0,
    pieces.findIndex((piece) => piece.containsPoint(centroid)),
  );
}

function stepShapes(scenario: ConvexDecompositionScenario) {
  const { trianglesA, trianglesB, piecesA, piecesB, pairs } = explainSum(scenario.a, scenario.b);
  const colorA = (i: number) => hue(i);
  const colorB = (i: number) => hue(piecesA.length + i);
  const triangles: Colored[] = [
    ...trianglesA.map((corners) => ({ polygon: new Polygon2(corners), color: colorA(pieceOf(corners, piecesA)) })),
    ...trianglesB.map((corners) => ({ polygon: new Polygon2(corners), color: colorB(pieceOf(corners, piecesB)) })),
  ];
  const pieces: Colored[] = [
    ...piecesA.map((polygon, i) => ({ polygon, color: colorA(i) })),
    ...piecesB.map((polygon, i) => ({ polygon, color: colorB(i) })),
  ];
  return {
    triangles,
    pieces,
    pairs: pairs.map(({ pieceA, sum }): Colored => ({ polygon: sum, color: colorA(pieceA) })),
    counts: {
      triangles: `A: ${trianglesA.length} triangles · B: ${trianglesB.length}`,
      pieces: `A: ${trianglesA.length} triangles → ${piecesA.length} pieces · B: ${trianglesB.length} → ${piecesB.length}`,
      pairs: `${piecesA.length} × ${piecesB.length} pieces → ${pairs.length} convex sums`,
      union: `${pairs.length} sums united`,
    },
  };
}

function DecompositionCell({ scenario, offset }: { scenario: ConvexDecompositionScenario; offset: Vec2 }) {
  const { regions, steps, fit, milliseconds } = useMemo(() => {
    const start = performance.now();
    const result = evaluateConvexDecompositionScenario(scenario);
    const milliseconds = performance.now() - start;
    const regions = [...(result.regions ?? []), ...result.polygons.map((p) => ArcPolygon2.fromPolygon(p))];
    // Every stage of one example fits the same frame: the result bounds them all.
    const geometries: Geometry2[] = [...scenario.a, ...scenario.b, ...regions];
    return { regions, steps: stepShapes(scenario), fit: fitGeometriesToFrame(geometries), milliseconds };
  }, [scenario]);

  const { stage } = scenario;
  const outer = regions.filter((region) => region.signedArea() > 0);
  const holes = regions.filter((region) => region.signedArea() < 0);
  const area = regions.reduce((sum, region) => sum + region.signedArea(), 0);
  const outline = (polygon: Polygon2) =>
    [...polygon.vertices, polygon.vertices[0]!].map((point) => vec2ToTuple(fit(point), offset));
  const filled = ({ polygon, color }: Colored, opacity: number) => (
    <ContainerInteriorMesh
      container={polygon}
      fit={fit}
      offset={offset}
      color={color}
      opacity={opacity}
      z={-0.1}
      renderOrder={-2}
    />
  );

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {/* 0: every triangle, faintly filled in the colour of the piece it merges into. */}
      {stage === 'triangles'
        ? steps.triangles.map((shape, index) => (
            <group key={`triangle-${index}`}>
              {filled(shape, 0.18)}
              <Line
                points={outline(shape.polygon)}
                color={COLORS.triangle}
                lineWidth={0.75}
                transparent
                opacity={0.8}
              />
            </group>
          ))
        : null}

      {/* 1: the merged convex pieces. */}
      {stage === 'pieces'
        ? steps.pieces.map((shape, index) => (
            <group key={`piece-${index}`}>
              {filled(shape, 0.45)}
              <Line points={outline(shape.polygon)} color={shape.color} lineWidth={1.5} />
            </group>
          ))
        : null}

      {/* 2: every pair of pieces summed, translucent so the overlaps show; 3: the same, faint under the union. */}
      {stage === 'pairs' || stage === 'union'
        ? steps.pairs.map((shape, index) => (
            <group key={`pair-${index}`}>
              {stage === 'pairs' ? filled(shape, 0.1) : null}
              <Line
                points={outline(shape.polygon)}
                color={shape.color}
                lineWidth={stage === 'pairs' ? 1.25 : 0.75}
                transparent
                opacity={stage === 'pairs' ? 0.9 : 0.35}
              />
            </group>
          ))
        : null}

      {stage === 'union' ? (
        <>
          {outer.map((region, index) => (
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
          {holes.map((region, index) => (
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
          {regions.map((region, index) => (
            <Line
              key={`region-${index}`}
              points={arcChainDisplayPoints(region.segments(), true, displayChordTolerance(fit)).map((point) =>
                vec2ToTuple(fit(point), offset),
              )}
              color={region.signedArea() > 0 ? COLORS.result : COLORS.hole}
              lineWidth={2.25}
            />
          ))}
        </>
      ) : null}

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
      {scenario.b.map((shape, index) => (
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

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {stage === 'union' ? `area ${area.toFixed(3)} · ` : ''}
            {milliseconds.toFixed(1)} ms
          </div>
          <div className='text-green-300'>{steps.counts[stage]}</div>
        </div>
      </Html>
    </group>
  );
}

export function ConvexDecomposition2Visualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={convexDecompositionScenarioRows}
      renderCell={(scenario, offset) => <DecompositionCell scenario={scenario} offset={offset} />}
    />
  );
}

export default ConvexDecomposition2Visualisation;
