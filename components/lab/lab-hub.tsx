import Breadcrumbs from "@/components/breadcrumbs";
import DemoCard from "@/components/lab/demo-card";
import LegacyHashRedirect from "@/components/lab/legacy-hash-redirect";
import { PlaygroundCallout } from "@/components/lab/library-index";
import { getDemoPath, getLocale, getPath, getTranslations } from "@/utilities/l10n";
import { demoLibraries, demoLibraryInfo, demosFor } from "@dirty-geometry/visualisation/meta";
import Link from "next/link";

/** `/lab/`: both libraries with a card per demo. */
export default function LabHub({ locale }: { locale?: string }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);

  return (
    <div className="space-y-16">
      <LegacyHashRedirect labPath={getPath(activeLocale, "lab")} />
      <Breadcrumbs items={[{ label: t.lab.home, href: getPath(activeLocale, "home") }, { label: t.pages.lab }]} />

      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-dg-sky-600">{t.lab.eyebrow}</p>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">{t.lab.heading}</h1>
        <p className="text-lg text-dg-muted leading-relaxed">{t.lab.intro}</p>
      </section>

      {demoLibraries.map((library) => {
        const info = demoLibraryInfo[library];
        const demos = demosFor(library);
        return (
          <section key={library} id={library} className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dg-border pb-4">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">{info.label}</h2>
                <p className="text-sm text-dg-muted mt-1">
                  <code>{info.packageName}</code> · {t.lab.libraries[library]}
                </p>
              </div>
              <Link
                href={getPath(activeLocale, library)}
                className="text-xs font-bold tracking-[0.25em] uppercase text-dg-subtle hover:text-dg-steel-600 transition-colors duration-200"
              >
                {demos.length} {t.lab.demos} →
              </Link>
            </div>
            {library === "vec2" && <PlaygroundCallout locale={activeLocale} />}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {demos.map((demo) => (
                <DemoCard key={demo.id} demo={demo} href={getDemoPath(activeLocale, library, demo.id)} />
              ))}
            </div>
          </section>
        );
      })}

      <BackHome locale={activeLocale} />
    </div>
  );
}

export function BackHome({ locale, extra }: { locale?: string; extra?: React.ReactNode }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-dg-border pt-8">
      <Link
        href={getPath(activeLocale, "home")}
        className="inline-flex items-center gap-3 border-2 border-dg-navy-900 px-6 py-3 text-xs font-bold tracking-[0.25em] uppercase hover:bg-dg-navy-900 hover:text-dg-sky-200 transition-all duration-300"
      >
        <span aria-hidden="true">←</span> {t.lab.backHome}
      </Link>
      {extra}
    </div>
  );
}
