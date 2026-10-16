import { useEffect, useMemo } from 'react';
import type { Container2 } from '@dirty-geometry/vec2/geometry/kinds';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { createContainerFill } from '../display/interior';

type ContainerInteriorMeshProps = {
  container: Container2;
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
  color?: string;
  opacity?: number;
  /** Depth of the fill below the outlines. */
  z?: number;
  renderOrder?: number;
};

/** Filled mesh for the interior of a container region (half-plane, box, circle, polygon or mesh). */
export function ContainerInteriorMesh({
  container,
  fit,
  offset,
  color = '#4da3ff',
  opacity = 0.2,
  z = -0.02,
  renderOrder,
}: ContainerInteriorMeshProps) {
  const fill = useMemo(() => createContainerFill(container, { fit, offset }), [container, fit, offset]);

  // Attached via <primitive>, so R3F never disposes it: free the GPU buffers when the fill changes or unmounts.
  useEffect(() => () => fill?.geometry.dispose(), [fill]);

  if (!fill) return null;

  return (
    <mesh position={[offset.x, offset.y, z]} renderOrder={renderOrder}>
      <primitive object={fill.geometry} attach='geometry' />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
