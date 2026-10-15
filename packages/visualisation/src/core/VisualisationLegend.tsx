'use client';

export type LegendItem = {
  color: string;
  label: string;
  /** Optional shape hint for the swatch. Defaults to a filled circle. */
  shape?: 'line' | 'point' | 'polygon';
};

export function VisualisationLegend({ items }: { items: readonly LegendItem[] }) {
  return (
    <div className='pointer-events-none absolute bottom-4 left-4 z-10 rounded-md bg-black/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-sm'>
      <div className='mb-1.5 text-[10px] font-semibold tracking-wide text-white/50 uppercase'>Legend</div>
      <ul className='flex flex-col gap-1.5'>
        {items.map((item) => (
          <li key={item.label} className='flex items-center gap-2'>
            <LegendSwatch color={item.color} shape={item.shape ?? 'point'} />
            <span className='text-white/85'>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegendSwatch({ color, shape }: { color: string; shape: 'line' | 'point' | 'polygon' }) {
  if (shape === 'line') {
    return (
      <span className='inline-block h-0.5 w-4 shrink-0 rounded-full' style={{ backgroundColor: color }} aria-hidden />
    );
  }

  if (shape === 'polygon') {
    return (
      <span
        className='inline-block size-2.5 shrink-0'
        style={{
          backgroundColor: color,
          opacity: 0.35,
          outline: `1.5px solid ${color}`,
          outlineOffset: -1,
        }}
        aria-hidden
      />
    );
  }

  return (
    <span className='inline-block size-2.5 shrink-0 rounded-full' style={{ backgroundColor: color }} aria-hidden />
  );
}
