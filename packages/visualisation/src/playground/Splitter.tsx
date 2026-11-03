'use client';

/**
 * The bar between two panes side by side: drag it (or use ← →) to share the width, double-click it for the default.
 * The share is a viewer's convenience, kept in this browser only.
 */
import { useEffect, useRef, useState } from 'react';

const KEY = 'dirty-geometry.playground.split';
export const SPLIT_DEFAULT = 60;
const MIN = 25;
const MAX = 80;
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

/** The left pane's share of the width, in percent, remembered across visits. */
export function useSplit() {
  const [split, setSplit] = useState(SPLIT_DEFAULT);
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(KEY));
      if (stored) setSplit(clamp(stored));
    } catch {
      // no storage: the default
    }
  }, []);
  const update = (value: number) => {
    const next = clamp(value);
    setSplit(next);
    try {
      window.localStorage.setItem(KEY, String(Math.round(next * 10) / 10));
    } catch {
      // no storage: it lasts until the page closes
    }
  };
  return [split, update] as const;
}

export function Splitter({
  split,
  onSplit,
  container,
}: {
  split: number;
  onSplit: (split: number) => void;
  /** The element both panes share, whose width the percentage is of. */
  container: React.RefObject<HTMLElement | null>;
}) {
  const [dragging, setDragging] = useState(false);
  const moved = useRef(onSplit);
  moved.current = onSplit;
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const rect = container.current?.getBoundingClientRect();
      if (rect && rect.width) moved.current(((event.clientX - rect.left) / rect.width) * 100);
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, container]);
  return (
    <>
      <div
        role='separator'
        aria-orientation='vertical'
        aria-label='share of the width: nodes and drawing'
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Math.round(split)}
        tabIndex={0}
        title='drag to resize · double-click to reset'
        className={`group relative z-20 w-1.5 shrink-0 cursor-col-resize bg-dg-border hover:bg-dg-steel-600 focus:bg-dg-steel-600 focus:outline-none ${dragging ? 'bg-dg-steel-600' : ''}`}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={() => onSplit(SPLIT_DEFAULT)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSplit(split - 5);
          else if (event.key === 'ArrowRight') onSplit(split + 5);
          else return;
          event.preventDefault();
        }}
      >
        {/* A wider grip than the visible bar. */}
        <span aria-hidden='true' className='absolute inset-y-0 -right-1.5 -left-1.5' />
      </div>
      {/* While dragging, nothing under the pointer (the node scene, the drawing) takes it. */}
      {dragging && <div aria-hidden='true' className='fixed inset-0 z-50 cursor-col-resize' />}
    </>
  );
}
