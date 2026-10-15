import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';

/** Polygon mesh as shared vertices plus faces given as vertex-index loops (CCW). */
export class NGonMesh {
  constructor(
    public vertices: Vec2[],
    public faces: number[][],
  ) {}
}
