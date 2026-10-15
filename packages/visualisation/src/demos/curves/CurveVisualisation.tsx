'use client';

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';
import { Polygon2 } from '@dirty-geometry/vec2/geometry/regions/polygon2';
import { Polyline2 } from '@dirty-geometry/vec2/geometry/curves/polyline2';
import { Epsilon } from '@dirty-geometry/vec2/core/epsilon';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { createCurve, polygonScenarios, polylineScenarios, type CurveScenario } from './scenarios';
import { fitPointsToFrame, frameCorners, labelPosition, vec2ToTuple } from '../../core/frame';
import { ScenarioGridVisualisation } from '../../core/ScenarioGridVisualisation';
import { type VisualisationMeta } from '../../core/VisualisationShell';

export const curveVisualisationMeta: VisualisationMeta = {
  id: 'curves',
  label: 'Polyline / Polygon',
  title: 'Polyline2 / Polygon2',
  description:
    'Content is scaled into each [-2, 2] frame with margin. Hover overlapping samples to fan them apart and inspect their source.',
  legend: [
    { color: '#4da3ff', label: 'Curve', shape: 'line' },
    { color: '#5ce1ff', label: 'evaluate(t)' },
    { color: '#ffb347', label: 'evaluateAtLength(s)' },
    { color: '#ff5c5c', label: 'Query point' },
    { color: '#7dff7d', label: 'Closest point' },
    { color: '#c77dff', label: 'Closest (+tolerance)' },
  ],
};

const curveScenarioRows = [polylineScenarios, polygonScenarios] as const;

const MARKER_RADIUS = {
  index: 0.055,
  length: 0.045,
  query: 0.06,
  closest: 0.05,
  closestTol: 0.045,
} as const;

/** Overlap if centers are closer than half a typical marker radius. */
const OVERLAP_THRESHOLD = MARKER_RADIUS.index / 2;
const FAN_DISTANCE = MARKER_RADIUS.index * 2.75;
const LABEL_GAP = 0.16;

type SampleMarker = {
  id: string;
  fitted: Vec2;
  point: Vec2;
  color: string;
  radius: number;
  source: string;
};

type SampleCluster = {
  id: string;
  center: Vec2;
  markers: SampleMarker[];
};

function clusterMarkers(markers: SampleMarker[], threshold: number): SampleCluster[] {
  const used = new Set<number>();
  const clusters: SampleCluster[] = [];

  for (let i = 0; i < markers.length; i++) {
    if (used.has(i)) continue;

    const group = [markers[i]!];
    used.add(i);
    let grew = true;

    while (grew) {
      grew = false;

      for (let j = 0; j < markers.length; j++) {
        if (used.has(j)) continue;

        const candidate = markers[j]!;
        if (group.some((member) => member.fitted.distance(candidate.fitted) <= threshold)) {
          group.push(candidate);
          used.add(j);
          grew = true;
        }
      }
    }

    clusters.push({
      id: `cluster-${i}`,
      center: Vec2.center(...group.map((marker) => marker.fitted)),
      markers: group,
    });
  }

  return clusters;
}

function fanPosition(center: Vec2, index: number, count: number, distance: number): Vec2 {
  if (count <= 1) return center.clone();

  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return center.add(new Vec2(Math.cos(angle), Math.sin(angle)).scale(distance));
}

function SampleClusterVisual({ cluster, offset }: { cluster: SampleCluster; offset: Vec2 }) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const labelRefs = useRef<(Group | null)[]>([]);
  const isOverlap = cluster.markers.length > 1;
  const largestRadius = Math.max(...cluster.markers.map((marker) => marker.radius));
  /** Tight hit target while collapsed; when open, 10% larger than the fan offset so vertices stay hoverable. */
  const closedHoverRadius = largestRadius * 1.35;
  const openHoverRadius = FAN_DISTANCE * 1.1;
  const hoverRadius = expanded ? openHoverRadius : closedHoverRadius;
  /** Pick radius around each expanded vertex for showing that vertex's banner. */
  const vertexPickRadius = largestRadius * 2.8;

  const restPositions = useMemo(() => cluster.markers.map((marker) => marker.fitted), [cluster.markers]);

  const expandedPositions = useMemo(
    () => cluster.markers.map((_, index) => fanPosition(cluster.center, index, cluster.markers.length, FAN_DISTANCE)),
    [cluster.center, cluster.markers],
  );

  useFrame((_, delta) => {
    const speed = Math.min(1, delta * 14);
    const targets = expanded && isOverlap ? expandedPositions : restPositions;
    const centerX = cluster.center.x + offset.x;
    const centerY = cluster.center.y + offset.y;

    for (let i = 0; i < cluster.markers.length; i++) {
      const mesh = meshRefs.current[i];
      const label = labelRefs.current[i];
      const target = targets[i];
      const marker = cluster.markers[i];
      if (!mesh || !target || !marker) continue;

      mesh.position.x += (target.x + offset.x - mesh.position.x) * speed;
      mesh.position.y += (target.y + offset.y - mesh.position.y) * speed;

      if (!label || hoveredId !== marker.id) continue;

      let dx = mesh.position.x - centerX;
      let dy = mesh.position.y - centerY;
      const length = Math.hypot(dx, dy);

      if (length < 1e-6) {
        dx = 0;
        dy = 1;
      } else {
        dx /= length;
        dy /= length;
      }

      const outward = marker.radius + LABEL_GAP;
      label.position.x = mesh.position.x + dx * outward;
      label.position.y = mesh.position.y + dy * outward;
      label.position.z = 0;
    }
  });

  function pickHoveredMarker(pointX: number, pointY: number): string | null {
    if (!isOverlap) {
      return cluster.markers[0]?.id ?? null;
    }

    let bestId: string | null = null;
    let bestDistance = vertexPickRadius;

    for (let i = 0; i < cluster.markers.length; i++) {
      const mesh = meshRefs.current[i];
      const marker = cluster.markers[i];
      if (!mesh || !marker) continue;

      const distance = Math.hypot(mesh.position.x - pointX, mesh.position.y - pointY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = marker.id;
      }
    }

    return bestId;
  }

  return (
    <group>
      {/* Invisible hit target: small when closed, larger when open so fanned vertices stay hoverable. */}
      <mesh
        position={vec2ToTuple(cluster.center, offset)}
        scale={hoverRadius}
        onPointerOver={(event) => {
          event.stopPropagation();
          setExpanded(true);
          setHoveredId(pickHoveredMarker(event.point.x, event.point.y));
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          if (!expanded) return;
          setHoveredId(pickHoveredMarker(event.point.x, event.point.y));
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setExpanded(false);
          setHoveredId(null);
        }}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {cluster.markers.map((marker, index) => (
        <mesh
          key={marker.id}
          ref={(node) => {
            meshRefs.current[index] = node;
          }}
          position={vec2ToTuple(restPositions[index]!, offset)}
          raycast={() => {
            // Visible markers are display-only; the hidden hover sphere owns interaction.
          }}
        >
          <sphereGeometry args={[marker.radius, 12, 12]} />
          <meshBasicMaterial color={marker.color} />
        </mesh>
      ))}

      {expanded && hoveredId
        ? cluster.markers.map((marker, index) =>
            marker.id === hoveredId ? (
              <group
                key={`label-${marker.id}`}
                ref={(node) => {
                  labelRefs.current[index] = node;
                }}
                position={vec2ToTuple(restPositions[index]!, offset)}
              >
                <Html center style={{ pointerEvents: 'none' }}>
                  <div className='whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[9px] leading-tight text-white shadow'>
                    <div className='font-medium'>{marker.source}</div>
                    <div className='text-white/70'>
                      ({formatNumber(marker.point.x)}, {formatNumber(marker.point.y)})
                    </div>
                    {isOverlap ? (
                      <div className='text-white/55'>
                        {index + 1}/{cluster.markers.length} overlapping
                      </div>
                    ) : null}
                  </div>
                </Html>
              </group>
            ) : null,
          )
        : null}
    </group>
  );
}

function CurveScenarioVisual({ scenario, offset }: { scenario: CurveScenario; offset: Vec2 }) {
  const curve = createCurve(scenario);
  const tolerance = scenario.additionalTolerance ?? 0;
  const indexSamples = scenario.indexSamples.map((t) => ({
    t,
    point: curve.evaluate(t),
  }));
  const lengthSamples = scenario.lengthSamples.map((s) => ({
    s,
    point: curve.evaluateAtLength(s),
  }));
  const closestPoints = scenario.query ? curve.closestPointsForPoint(scenario.query, tolerance) : [];
  const closestParams = scenario.query ? curve.closestParametersForPoint(scenario.query, tolerance) : [];
  const smallestDistance = scenario.query ? curve.distanceToPoint(scenario.query) : 0;

  const fitPoints = [
    ...scenario.vertices,
    ...indexSamples.map((sample) => sample.point),
    ...lengthSamples.map((sample) => sample.point),
    ...(scenario.query ? [scenario.query, ...closestPoints] : []),
  ];
  const fit = fitPointsToFrame(fitPoints);

  const outline = scenario.vertices.map(fit);
  if (curve instanceof Polygon2) {
    outline.push(fit(scenario.vertices[0]!));
  }

  const outlineTuples = outline.map((point) => vec2ToTuple(point, offset));

  const closestMarkers = closestPoints.map((point, index) => {
    const distance = scenario.query!.distance(point);
    const isStrict = distance <= smallestDistance + Epsilon.value;
    const t = closestParams[index] ?? 0;

    return {
      id: `closest-${index}`,
      fitted: fit(point),
      point,
      color: isStrict ? '#7dff7d' : '#c77dff',
      radius: isStrict ? MARKER_RADIUS.closest : MARKER_RADIUS.closestTol,
      source: isStrict
        ? `closest (t=${formatNumber(t)})`
        : `closest +tol (t=${formatNumber(t)}, d=${formatNumber(distance)})`,
      isStrict,
    };
  });

  const markers: SampleMarker[] = [
    ...indexSamples.map((sample, index) => ({
      id: `index-${index}`,
      fitted: fit(sample.point),
      point: sample.point,
      color: '#5ce1ff',
      radius: MARKER_RADIUS.index,
      source: `evaluate(${formatNumber(sample.t)})`,
    })),
    ...lengthSamples.map((sample, index) => ({
      id: `length-${index}`,
      fitted: fit(sample.point),
      point: sample.point,
      color: '#ffb347',
      radius: MARKER_RADIUS.length,
      source: `evaluateAtLength(${formatNumber(sample.s)})`,
    })),
    ...(scenario.query
      ? [
          {
            id: 'query',
            fitted: fit(scenario.query),
            point: scenario.query,
            color: '#ff5c5c',
            radius: MARKER_RADIUS.query,
            source: 'query point',
          },
          ...closestMarkers,
        ]
      : []),
  ];

  const clusters = clusterMarkers(markers, OVERLAP_THRESHOLD);

  return (
    <group>
      <Line points={frameCorners(offset)} color='#3a4150' lineWidth={1} />

      {outlineTuples.length >= 2 ? <Line points={outlineTuples} color='#4da3ff' lineWidth={2} /> : null}

      {scenario.query
        ? closestMarkers.map((marker, index) => (
            <Line
              key={`link-${index}`}
              points={[vec2ToTuple(fit(scenario.query!), offset), vec2ToTuple(marker.fitted, offset)]}
              color={marker.color}
              lineWidth={1}
            />
          ))
        : null}

      {clusters.map((cluster) => (
        <SampleClusterVisual key={cluster.id} cluster={cluster} offset={offset} />
      ))}

      <Html center position={labelPosition(offset)} style={{ pointerEvents: 'none' }}>
        <div className='max-w-32 rounded bg-black/75 px-1.5 py-0.5 text-center text-[8px] leading-tight text-white'>
          <div className='font-semibold'>{scenario.name}</div>
          <div className='text-white/70'>
            {curve instanceof Polyline2 ? 'Polyline2' : 'Polygon2'} · n=
            {curve.n()}
          </div>
          <div className='text-cyan-300/90'>index t · {scenario.indexSamples.map((t) => t.toFixed(1)).join(', ')}</div>
          {scenario.query ? (
            <div className='text-green-300/90'>
              closest t · {closestParams.map((t) => t.toFixed(2)).join(', ')}
              {tolerance > 0 ? ` · +tol ${formatNumber(tolerance)}` : ''}
            </div>
          ) : null}
        </div>
      </Html>
    </group>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function CurveVisualisation() {
  return (
    <ScenarioGridVisualisation
      scenarioRows={curveScenarioRows}
      renderCell={(scenario, offset) => <CurveScenarioVisual scenario={scenario} offset={offset} />}
    />
  );
}

export default CurveVisualisation;
