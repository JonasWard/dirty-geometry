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
    <div className="space-y-8">
      <LegacyHashRedirect labPath={getPath(activeLocale, "lab")} />

      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.35em] uppercase mb-2 text-dg-sky-600">{t.lab.eyebrow}</p>
        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight mb-2">{t.lab.heading}</h1>
        <p className="text-base text-dg-muted leading-relaxed">{t.lab.intro}</p>
      </section>

      {demoLibraries.map((library) => {
        const info = demoLibraryInfo[library];
        const demos = demosFor(library);
        return (
          <section key={library} id={library} className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dg-border pb-2">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">{info.label}</h2>
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {demos.map((demo) => (
                <DemoCard key={demo.id} demo={demo} href={getDemoPath(activeLocale, library, demo.id)} />
              ))}
            </div>
          </section>
        );
      })}

    </div>
  );
}
