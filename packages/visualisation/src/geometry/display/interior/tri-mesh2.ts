import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { TriMesh2 } from '@dirty-geometry/vec2/geometry/regions/tri-mesh2';
import type { GeometryDisplayContext } from '../context';
import { CONTAINER_FILL_THREE_KIND, type BufferFillDisplay } from '../types';

export function createTriMesh2Fill(geometry: TriMesh2, ctx: GeometryDisplayContext): BufferFillDisplay | null {
  if (geometry.triangleCount === 0) return null;

  const positions: number[] = [];
  for (const index of geometry.triangleCorners()) {
    const vertex = ctx.fit(geometry.vertices[index]!);
    positions.push(vertex.x, vertex.y, 0);
  }

  const buffer = new BufferGeometry();
  buffer.setAttribute('position', new Float32BufferAttribute(positions, 3));

  return {
    threeKind: CONTAINER_FILL_THREE_KIND.TriMesh2,
    geometry: buffer,
  };
}
