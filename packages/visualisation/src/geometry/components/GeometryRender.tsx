import type { ReactNode } from 'react';
import type { Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { GeometryFrameOptions } from '../frame/constants';
import type { GeometryDisplayContext } from '../display/context';
import { createGeometryOutline } from '../display/outline';
import { OutlineMesh } from './OutlineMesh';
import { vec2ToTuple } from '../../core/frame';

export type GeometryRenderProps = {
  geometry: Geometry2;
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
  color: string;
  keyPrefix?: string;
  lineWidth?: number;
  pointRadius?: number;
  /** World z lift for draw order (lower = behind). */
  z?: number;
} & GeometryFrameOptions;

/** Outline / marker render for any Geometry2 type. */
export function GeometryRender({
  geometry,
  fit,
  offset,
  color,
  keyPrefix = 'geometry',
  lineWidth = 2,
  pointRadius = 0.08,
  z = 0,
  definitionGeometry = false,
}: GeometryRenderProps): ReactNode {
  const ctx: GeometryDisplayContext = { fit, offset, definitionGeometry };

  if (geometry.type === 'Vec2') {
    const [x, y] = vec2ToTuple(fit(geometry), offset);
    return (
      <mesh key={`${keyPrefix}-point`} position={[x, y, z]}>
        <sphereGeometry args={[pointRadius, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  }

  const display = createGeometryOutline(geometry, ctx);
  if (!display) return null;

  return (
    <group position={[0, 0, z]}>
      <OutlineMesh display={display} color={color} lineWidth={lineWidth} keyPrefix={keyPrefix} />
    </group>
  );
}
