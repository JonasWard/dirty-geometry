import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Frame2 } from '@dirty-geometry/vec2/core/frame2';
import type { Grid2 } from '@dirty-geometry/vec2/grid/core/grid2';
import { GridCell2Collection } from '@dirty-geometry/vec2/grid/regions/grid-cell2-collection';
import type { GridGeometry2 } from '@dirty-geometry/vec2/grid/regions/kinds';
import { GridLine2 } from '@dirty-geometry/vec2/grid/regions/grid-line2';
import { GridPolyline2 } from '@dirty-geometry/vec2/grid/regions/grid-polyline2';
import { GridPolygon2 } from '@dirty-geometry/vec2/grid/regions/grid-polygon2';
import { GridRectangle2 } from '@dirty-geometry/vec2/grid/regions/grid-rectangle2';
import { Shape } from 'three';
import {
  createCellCollectionFillDisplay,
  createGrid2Display,
  createGridLine2Display,
  createGridPolyline2Display,
  createGridPolygon2Display,
  createGridRectangle2Display,
} from '../display/grid';
import { GRID2_COLORS } from '../../demos/grid2/colors';

type GridGeometryRenderProps = {
  grid: Grid2;
  geometry?: GridGeometry2;
  cellCollection?: GridCell2Collection;
  fit: (point: Vec2) => Vec2;
  offset: Vec2;
  columnCount?: number;
  rowCount?: number;
  latticeColor?: string;
  fillColor?: string;
  outlineColor?: string;
  markerColor?: string;
  keyPrefix?: string;
  showLattice?: boolean;
  showGeometryFill?: boolean;
  fillOpacity?: number;
};

const DEFAULT_LATTICE_COLOR = GRID2_COLORS.lattice;
const DEFAULT_FILL_COLOR = GRID2_COLORS.geometryFill;
const DEFAULT_OUTLINE_COLOR = GRID2_COLORS.geometryOutline;
const DEFAULT_MARKER_COLOR = GRID2_COLORS.geometryMarker;
const MARKER_RADIUS = 0.05;
const FILL_OPACITY = 0.35;

function CellFillMesh({
  quad,
  color,
  keyPrefix,
  opacity = FILL_OPACITY,
}: {
  quad: [number, number, number][];
  color: string;
  keyPrefix: string;
  opacity?: number;
}) {
  const shape = useMemo(() => {
    const s = new Shape();
    if (quad.length < 4) return null;
    s.moveTo(quad[0]![0], quad[0]![1]);
    for (let i = 1; i < 4; i++) {
      s.lineTo(quad[i]![0], quad[i]![1]);
    }
    s.closePath();
    return s;
  }, [quad]);

  if (!shape) return null;

  return (
    <mesh key={keyPrefix} position={[0, 0, -0.01]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

export function GridGeometryRender({
  grid,
  geometry,
  cellCollection,
  fit,
  offset,
  columnCount = 5,
  rowCount = 5,
  latticeColor = DEFAULT_LATTICE_COLOR,
  fillColor = DEFAULT_FILL_COLOR,
  outlineColor = DEFAULT_OUTLINE_COLOR,
  markerColor = DEFAULT_MARKER_COLOR,
  keyPrefix = 'grid',
  showLattice = true,
  showGeometryFill = true,
  fillOpacity = FILL_OPACITY,
}: GridGeometryRenderProps): ReactNode {
  const ctx = useMemo(() => ({ fit, offset, grid }), [fit, offset, grid]);

  const lattice = useMemo(
    () => createGrid2Display(grid, columnCount, rowCount, ctx),
    [grid, columnCount, rowCount, ctx],
  );

  const geometryDisplay = useMemo(() => {
    if (!geometry) return null;
    if (geometry instanceof GridCell2Collection) return null;
    if (geometry instanceof GridLine2) return createGridLine2Display(geometry, ctx);
    if (geometry instanceof GridPolyline2) return createGridPolyline2Display(geometry, ctx);
    if (geometry instanceof GridPolygon2) return createGridPolygon2Display(geometry, ctx);
    if (geometry instanceof GridRectangle2) return createGridRectangle2Display(geometry, ctx);
    return null;
  }, [geometry, ctx]);

  const collectionFill = useMemo(() => {
    if (geometry instanceof GridCell2Collection) {
      return createCellCollectionFillDisplay(grid, geometry, ctx);
    }
    if (cellCollection && !geometry) {
      return createCellCollectionFillDisplay(grid, cellCollection, ctx);
    }
    return null;
  }, [geometry, cellCollection, grid, ctx]);

  return (
    <group>
      {showLattice &&
        lattice.segments.map(([from, to], index) => (
          <Line key={`${keyPrefix}-lattice-${index}`} points={[from, to]} color={latticeColor} lineWidth={1} />
        ))}

      {showGeometryFill &&
        geometryDisplay &&
        geometryDisplay.cellFill.quads.map((quad, index) => (
          <CellFillMesh
            key={`${keyPrefix}-fill-${index}`}
            quad={quad}
            color={fillColor}
            keyPrefix={`${keyPrefix}-fill-${index}`}
            opacity={fillOpacity}
          />
        ))}

      {collectionFill &&
        collectionFill.quads.map((quad, index) => (
          <CellFillMesh
            key={`${keyPrefix}-collection-fill-${index}`}
            quad={quad}
            color={fillColor}
            keyPrefix={`${keyPrefix}-collection-fill-${index}`}
            opacity={fillOpacity}
          />
        ))}

      {geometryDisplay &&
        'outlineSegments' in geometryDisplay &&
        geometryDisplay.outlineSegments.map(([from, to], index) => (
          <Line key={`${keyPrefix}-outline-${index}`} points={[from, to]} color={outlineColor} lineWidth={2} />
        ))}

      {geometryDisplay &&
        ('endpointMarkers' in geometryDisplay
          ? geometryDisplay.endpointMarkers.points
          : 'vertexMarkers' in geometryDisplay
            ? geometryDisplay.vertexMarkers.points
            : 'cornerMarkers' in geometryDisplay
              ? geometryDisplay.cornerMarkers.points
              : []
        ).map((point, index) => (
          <mesh key={`${keyPrefix}-marker-${index}`} position={point}>
            <sphereGeometry args={[MARKER_RADIUS, 12, 12]} />
            <meshBasicMaterial color={markerColor} />
          </mesh>
        ))}
    </group>
  );
}
