import type { VisualisationMeta } from '../../../core/meta';
import { GRID2_COLORS } from '../../../geometry/display/grid/colors';

export const grid2RectangleDetectionMeta: VisualisationMeta = {
  id: 'grid2-rectangle-detection',
  label: 'Grid2 Rect Detect',
  title: 'Grid2 rectangle detection',
  description:
    'Build a custom Grid2 from one or more world-space rectilinear Polygon2s (optionally Douglas-Peucker simplified), trace axis-aligned grid boundaries, and decompose occupied cells into rectangles.',
  legend: [
    { color: '#d0d0d0', label: 'World polygon', shape: 'line' },
    { color: GRID2_COLORS.lattice, label: 'Grid lattice', shape: 'line' },
    { color: GRID2_COLORS.geometryOutline, label: 'Grid polygon', shape: 'line' },
    { color: GRID2_COLORS.resultFill, label: 'Detected rectangles' },
  ],
};

export const grid2VisualisationMeta: VisualisationMeta = {
  id: 'grid2',
  label: 'Grid2',
  title: 'Grid2',
  description:
    'Grid lattice with uniform or custom column/row sizes, Bresenham lines, concave polygon fills, iterative unions, set ops, and chains. Blue = result; red = subtracted; earth tones = operands.',
  legend: [
    { color: GRID2_COLORS.lattice, label: 'Grid lattice', shape: 'line' },
    { color: GRID2_COLORS.resultFill, label: 'Result cells' },
    { color: GRID2_COLORS.subtractive, label: 'Subtracted' },
    { color: GRID2_COLORS.earthTones[0]!, label: 'Operands', shape: 'line' },
  ],
};
