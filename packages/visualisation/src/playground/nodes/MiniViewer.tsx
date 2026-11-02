'use client';

/**
 * The drawing on a narrow screen, inside the node scene: a small window in the bottom-right corner, which opens full
 * screen (with sliders for the inputs) or hides. On a wide screen the drawing has a column of its own instead.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ViewerState = 'small' | 'full' | 'hidden';

/** In the small window the buttons stay small (a finger still finds them in its corner). */
const small =
  'flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-xs text-dg-ink shadow hover:bg-white';
const button =
  'flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sm text-dg-ink shadow hover:bg-white coarse:h-10 coarse:w-10';

export function MiniViewer({
  state,
  onState,
  canvas,
  inputs,
}: {
  state: ViewerState;
  onState: (state: ViewerState) => void;
  /** The drawing itself. */
  canvas: ReactNode;
  /** The inputs' sliders, shown full screen. */
  inputs: ReactNode;
}) {
  if (state === 'hidden') return null;
  // Full screen it covers the page, the site header too: drawn in the body, not inside the scene's layers.
  if (state === 'full')
    return createPortal(
      <div role='dialog' aria-label='drawing' className='fixed inset-0 z-[60] flex flex-col bg-[#0b0d12]'>
        <div className='relative isolate min-h-0 flex-1'>
          {canvas}
          <div className='absolute top-3 right-3 z-10 flex gap-2'>
            <button
              type='button'
              aria-label='make the drawing small'
              className={button}
              onClick={() => onState('small')}
            >
              ↙
            </button>
            <button type='button' aria-label='hide the drawing' className={button} onClick={() => onState('hidden')}>
              ✕
            </button>
          </div>
        </div>
        <div className='max-h-[40%] shrink-0 overflow-y-auto bg-white/95 p-3 text-xs'>{inputs}</div>
      </div>,
      document.body,
    );
  return (
    <div className='relative isolate aspect-[4/3] w-[min(46vw,18rem)] overflow-hidden rounded-md bg-[#0b0d12] shadow-lg'>
      {canvas}
      <div className='absolute top-1 right-1 z-10 flex gap-1'>
        <button
          type='button'
          aria-label='show the drawing full screen'
          className={small}
          onClick={() => onState('full')}
        >
          ⤢
        </button>
        <button type='button' aria-label='hide the drawing' className={small} onClick={() => onState('hidden')}>
          ✕
        </button>
      </div>
    </div>
  );
}
