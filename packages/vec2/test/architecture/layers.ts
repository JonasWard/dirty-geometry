/** Layer of a vec2 module (path relative to `src`, no extension). Runtime imports may only point to the same or a lower layer. */
export function vec2Layer(module: string): number {
  if (module === 'core/epsilon' || module.startsWith('hash/') || module.startsWith('analysis/')) return 0;
  if (module.startsWith('core/') || module === 'bounds/interval2') return 1;
  if (module === 'bounds/aabb2' || module.startsWith('spatial/')) return 2;
  if (module.startsWith('geometry/')) return 3;
  if (module.startsWith('grid/')) return 4;
  if (module.startsWith('operations/')) return 5;
  if (module.startsWith('io/')) return 6;
  throw new Error(`vec2 module without a layer: ${module}`);
}
