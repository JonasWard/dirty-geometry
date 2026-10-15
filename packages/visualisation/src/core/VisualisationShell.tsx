'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LegendItem } from './VisualisationLegend';

export type VisualisationMeta = {
  id: string;
  label: string;
  title: string;
  description: string;
  legend: readonly LegendItem[];
};

export function useContainerSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: typeof window === 'undefined' ? 1 : window.innerWidth,
    height: typeof window === 'undefined' ? 1 : window.innerHeight,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width, height });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export function VisualisationCanvasHost({
  children,
}: {
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const [ref, size] = useContainerSize();

  return (
    <div ref={ref} className='h-full w-full'>
      {children(size)}
    </div>
  );
}
