/** Visual extent for unbounded geometry before clipping to the display frame. */
export const INFINITE_DISPLAY_SCALE = 1000;

export type GeometryFrameOptions = {
  /** Use finite definition segments for Ray2 / InfiniteLine2 instead of scaled unbounded display. */
  definitionGeometry?: boolean;
  margin?: number;
};
