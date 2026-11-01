import type { VisualisationMeta } from '../../../core/meta';

export const arcsVisualisationMeta: VisualisationMeta = {
  id: 'arcs',
  label: 'Arc / ArcPolyline / ArcPolygon',
  title: 'Arc2 / ArcPolyline2 / ArcPolygon2',
  description:
    'Arcs are stored as a chord plus a signed sagitta (the apex height above the chord midpoint; positive bulges left). Rows: single arcs, open chains (wall centrelines) with their offsets, and closed regions. Offsets mitre at kinks and fall back to a straight connector past the miter limit.',
  legend: [
    { color: '#4da3ff', label: 'Curve', shape: 'line' },
    { color: '#ffb347', label: 'Offset', shape: 'line' },
    { color: '#6b7280', label: 'Chord', shape: 'line' },
    { color: '#ff7ad9', label: 'Apex' },
    { color: '#8a8f99', label: 'Centre' },
    { color: '#5ce1ff', label: 'evaluateAtLength(s)' },
    { color: '#ff5c5c', label: 'Query point' },
    { color: '#7dff7d', label: 'Closest point' },
  ],
};
