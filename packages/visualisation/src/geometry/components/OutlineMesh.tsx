import { Line } from '@react-three/drei';
import type { ReactNode } from 'react';
import { GEOMETRY_OUTLINE_THREE_KIND, type OutlineDisplay } from '../display/types';

type OutlineMeshProps = {
  display: OutlineDisplay;
  color: string;
  lineWidth: number;
  keyPrefix: string;
};

export function OutlineMesh({ display, color, lineWidth, keyPrefix }: OutlineMeshProps): ReactNode {
  switch (display.threeKind) {
    case GEOMETRY_OUTLINE_THREE_KIND.Vec2:
      return null;
    case GEOMETRY_OUTLINE_THREE_KIND.Line2:
    case GEOMETRY_OUTLINE_THREE_KIND.Ray2:
    case GEOMETRY_OUTLINE_THREE_KIND.InfiniteLine2:
      return (
        <Line
          key={`${keyPrefix}-segment`}
          points={[display.points[0], display.points[1]]}
          color={color}
          lineWidth={lineWidth}
        />
      );
    case GEOMETRY_OUTLINE_THREE_KIND.Polyline2:
    case GEOMETRY_OUTLINE_THREE_KIND.Polygon2:
    case GEOMETRY_OUTLINE_THREE_KIND.Circle2:
    case GEOMETRY_OUTLINE_THREE_KIND.Aabb2:
      return <Line key={`${keyPrefix}-polyline`} points={display.points} color={color} lineWidth={lineWidth} />;
    case GEOMETRY_OUTLINE_THREE_KIND.TriMesh2:
      return (
        <>
          {display.segments.map(([from, to], index) => (
            <Line key={`${keyPrefix}-edge-${index}`} points={[from, to]} color={color} lineWidth={lineWidth} />
          ))}
        </>
      );
  }
}
