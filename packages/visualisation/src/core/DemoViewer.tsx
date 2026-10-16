'use client';

import { Suspense, useEffect, useState } from 'react';
import { getDemoView } from './registry';
import { VisualisationLegend } from './VisualisationLegend';

/**
 * Canvas area for one demo. The demo's code loads on first view; the legend shows right away.
 *
 * The demo mounts one frame after the previous one unmounted. drei's <Html> unmounts its label roots
 * synchronously; with the React build Next ships, doing that in the same commit that mounts the next
 * demo's labels throws a removeChild error and drops a label (review finding V8).
 */
export function DemoViewer({ library, id, className }: { library: string; id: string; className?: string }) {
  const view = getDemoView(library, id);
  const key = view ? `${view.meta.library}/${view.meta.id}` : null;
  const [mountedKey, setMountedKey] = useState<string | null>(null);

  useEffect(() => {
    setMountedKey(null);
    const frame = requestAnimationFrame(() => setMountedKey(key));
    return () => cancelAnimationFrame(frame);
  }, [key]);

  if (!view) return null;
  return (
    <div
      className={
        className ?? 'relative h-[75vh] min-h-[480px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]'
      }
    >
      <Suspense fallback={null}>{mountedKey === key ? view.render() : null}</Suspense>
      <VisualisationLegend items={view.meta.legend} />
    </div>
  );
}
