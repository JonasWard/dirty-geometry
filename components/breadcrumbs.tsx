"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CrumbLink = { label: string; href: string; current?: boolean };
/** A step of the trail; with a `menu`, it opens a list of its siblings to switch to. */
export type Crumb = { label: string; href?: string; menu?: readonly CrumbLink[] };

const text = "text-xs tracking-widest uppercase font-medium";

/** "Lab / vec2 ▾ / Curves ▾": every crumb but the last links; one with a menu switches between its siblings. */
export default function Breadcrumbs({ items, className = "" }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className}`}>
      <ol className={`flex items-center gap-1.5 whitespace-nowrap text-dg-subtle ${text}`}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden="true">/</span>}
              {item.menu ? (
                <CrumbMenu item={item} last={last} />
              ) : item.href && !last ? (
                <Link href={item.href} className="hover:text-dg-steel-600 transition-colors duration-200">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-dg-navy-900" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A crumb that opens its siblings. The list is drawn in a portal at the button's place, so a crumb row that scrolls
 * sideways (on phones) does not clip it.
 */
function CrumbMenu({ item, last }: { item: Crumb; last: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pathname = usePathname();

  // A page change closes it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const box = button.current?.getBoundingClientRect();
    if (box) setAt({ top: box.bottom + 6, left: Math.max(8, Math.min(box.left - 8, window.innerWidth - 248)) });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-current={last ? "page" : undefined}
        className={`inline-flex items-center gap-1 uppercase tracking-widest transition-colors duration-200 hover:text-dg-steel-600 ${
          last ? "text-dg-navy-900" : ""
        }`}
        onClick={() => setOpen((value) => !value)}
      >
        {item.label}
        <span aria-hidden="true" className="text-[9px]">
          ▾
        </span>
      </button>
      {open &&
        at &&
        createPortal(
          <ul
            ref={list}
            aria-label={item.label}
            style={{ top: at.top, left: at.left }}
            className={`fixed z-[60] max-h-[60vh] w-60 overflow-auto rounded border border-dg-border bg-white py-1 shadow-lg ${text}`}
          >
            {item.menu!.map((entry) => (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  aria-current={entry.current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-1.5 ${
                    entry.current
                      ? "bg-dg-navy-900 text-dg-sky-200"
                      : "text-dg-subtle hover:bg-dg-canvas hover:text-dg-steel-600"
                  }`}
                >
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
