import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';

export type GeometryDisplayContext = {
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
  definitionGeometry?: boolean;
};

export type PointDisplayOptions = {
  radius: number;
};

export type LineDisplayOptions = {
  closed?: boolean;
  segments?: number;
};
