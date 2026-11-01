"use client";

import { useEffect, useState } from "react";

/**
 * A titled info box that folds to its title line. Folding is remembered in this browser (under `storageKey`); it
 * opens unfolded where storage is unavailable.
 */
export default function InfoBox({
  storageKey,
  title,
  children,
}: {
  storageKey: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "closed") setOpen(false);
    } catch {
      // storage may be unavailable (private windows); the box then starts open
    }
  }, [storageKey]);
  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(storageKey, next ? "open" : "closed");
        } catch {
          // see above
        }
      }}
      className="group rounded-md border border-dg-sky-400/70 bg-dg-sky-200/25"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-dg-sky-600 text-[10px] font-bold text-white"
        >
          i
        </span>
        {title}
        <span aria-hidden="true" className="ml-auto text-[10px] text-dg-subtle transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-2.5 pl-9 text-sm leading-relaxed text-dg-muted">{children}</div>
    </details>
  );
}
