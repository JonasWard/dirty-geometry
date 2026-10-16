/** Legend entry shown under a demo. */
export type LegendItem = {
  color: string;
  label: string;
  /** Optional shape hint for the swatch. Defaults to a filled circle. */
  shape?: 'line' | 'point' | 'polygon';
};

/** What the lab shows about a demo before (and without) loading its three.js code. */
export type VisualisationMeta = {
  id: string;
  label: string;
  title: string;
  description: string;
  legend: readonly LegendItem[];
};
