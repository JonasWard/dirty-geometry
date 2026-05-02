"use client";

import Logo from "@/components/logo";
import { defaultLocale, locales, type Locale } from "@/config";
import { getPath, getTranslations } from "@/utilities/l10n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";

function localeFromPathname(pathname: string | null): Locale {
  if (!pathname) return defaultLocale;
  const rawBase = (process.env.NEXT_PUBLIC_BASE_PATH || "")
    .trim()
    .replace(/\/$/, "");
  let p = pathname;
  if (rawBase && p.startsWith(rawBase)) {
    p = p.slice(rawBase.length) || "/";
  }
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/").filter(Boolean);
  const first = parts[0];
  if (first && locales.includes(first as Locale)) return first as Locale;
  return defaultLocale;
}

export default function NotFoundPage() {
  const pathname = usePathname();
  const locale = useMemo(() => localeFromPathname(pathname), [pathname]);
  const t = getTranslations(locale);

  useEffect(() => {
    document.title = t.notFound.meta.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t.notFound.meta.description);
  }, [t]);

  return (
    <div className="min-h-screen bg-dg-canvas text-dg-ink">
      <header className="sticky top-0 z-50 bg-dg-canvas/95 backdrop-blur-sm border-b border-dg-border">
        <div className="max-w-[1400px] mx-auto w-full px-6 md:px-12 py-4 flex items-center justify-between">
          <Link
            href={getPath(locale, "home")}
            className="flex items-center gap-3 hover:opacity-70 transition-opacity"
          >
            <Logo />
            <span className="text-sm font-bold tracking-[0.2em] uppercase hidden sm:inline">
              dirty-geometry
            </span>
          </Link>
        </div>
      </header>
      <main className="px-8 md:px-16 lg:px-24 py-24">
        <div className="max-w-[1400px] mx-auto w-full">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-dg-sky-600">
              {t.notFound.eyebrow}
            </p>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight mb-6">
              {t.notFound.heading}
            </h1>
            <p className="text-lg text-dg-muted leading-relaxed mb-10">
              {t.notFound.body}
            </p>
            <Link
              href={getPath(locale, "home")}
              className="inline-flex items-center gap-3 border-2 border-dg-navy-900 px-8 py-4 text-xs font-bold tracking-[0.25em] uppercase hover:bg-dg-navy-900 hover:text-dg-sky-200 transition-all duration-300"
            >
              {t.notFound.backHome}
            </Link>

            <nav
              className="mt-16 pt-12 border-t border-dg-border"
              aria-label="Languages"
            >
              <p className="text-xs font-bold tracking-[0.35em] uppercase mb-4 text-dg-subtle">
                {t.notFound.otherLocales}
              </p>
              <div className="flex flex-wrap gap-3">
                {locales.map((l) => (
                  <Link
                    key={l}
                    href={getPath(l, "home")}
                    className={`text-xs tracking-widest uppercase font-medium px-3 py-1 border transition-colors ${
                      l === locale
                        ? "border-dg-navy-900 text-dg-navy-900"
                        : "border-dg-border text-dg-subtle hover:text-dg-muted hover:border-dg-borderStrong"
                    }`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
