"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const item = "text-xs tracking-widest uppercase font-medium transition-colors duration-200";

/** The same page in another language: the locale prefix of the current path is swapped. */
export function LocaleSwitch({
  locales,
  defaultLocale,
  active,
  className = "",
}: {
  locales: readonly string[];
  defaultLocale: string;
  active: string;
  className?: string;
}) {
  const pathname = usePathname() ?? "/";
  const prefix = new RegExp(`^/(${locales.join("|")})(?=/|$)`);
  const rest = pathname.replace(prefix, "") || "/";
  const pathFor = (locale: string) => {
    const path = `${locale === defaultLocale ? "" : `/${locale}`}${rest}`;
    return path.endsWith("/") ? path : `${path}/`;
  };
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-label="Language">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={pathFor(locale)}
          hrefLang={locale}
          aria-current={locale === active ? "true" : undefined}
          className={`${item} ${locale === active ? "text-dg-navy-900" : "text-dg-subtle hover:text-dg-steel-600"}`}
        >
          {locale}
        </Link>
      ))}
    </div>
  );
}

/** The ☰ button of narrow screens: a panel with the page links and languages, closed by a choice, Escape or a click outside. */
export function HeaderMenu({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded border border-dg-border text-dg-ink hover:border-dg-steel-600"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="text-base leading-none">
          {open ? "✕" : "☰"}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded border border-dg-border bg-white p-3 shadow-lg"
          onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
