import { useMemo } from 'react';
import type { Container2 } from '@dirty-geometry/vec2/geometry/kinds';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { createContainerFill } from '../display/interior';

const INTERIOR_COLOR = '#4da3ff';
const INTERIOR_OPACITY = 0.2;

type ContainerInteriorMeshProps = {
  container: Container2;
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
};

/** Filled mesh for the interior of a Contains2 container region. */
export function ContainerInteriorMesh({ container, fit, offset }: ContainerInteriorMeshProps) {
  const fill = useMemo(() => createContainerFill(container, { fit, offset }), [container, fit, offset]);

  if (!fill) return null;

  return (
    <mesh position={[offset.x, offset.y, -0.02]}>
      <primitive object={fill.geometry} attach='geometry' />
      <meshBasicMaterial color={INTERIOR_COLOR} transparent opacity={INTERIOR_OPACITY} depthWrite={false} />
    </mesh>
  );
}
