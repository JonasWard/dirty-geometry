import DemoCard from "@/components/lab/demo-card";
import { getDemoPath, getLocale, getPlaygroundPath, getTranslations } from "@/utilities/l10n";
import { demoLibraryInfo, demosFor, type DemoLibrary } from "@dirty-geometry/visualisation/meta";
import Link from "next/link";

/** `/lab/<library>/`: one library's demos. */
export default function LibraryIndex({ locale, library }: { locale?: string; library: DemoLibrary }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  const info = demoLibraryInfo[library];

  return (
    <div className="space-y-6">
      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.35em] uppercase mb-2 text-dg-sky-600">{t.lab.eyebrow}</p>
        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight mb-1">{info.label}</h1>
        <p className="text-sm text-dg-subtle mb-2">
          <code>{info.packageName}</code>
        </p>
        <p className="text-base text-dg-muted leading-relaxed">{t.lab.libraries[library]}</p>
      </section>
      {library === "vec2" && <PlaygroundCallout locale={activeLocale} />}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {demosFor(library).map((demo) => (
          <DemoCard key={demo.id} demo={demo} href={getDemoPath(activeLocale, library, demo.id)} />
        ))}
      </div>
    </div>
  );
}

/** The vec2 playground, above the demo cards. */
export function PlaygroundCallout({ locale }: { locale?: string }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  return (
    <Link
      href={getPlaygroundPath(activeLocale)}
      className="group flex flex-wrap items-center justify-between gap-3 border-2 border-dg-navy-900 px-4 py-3 hover:bg-dg-navy-900 hover:text-dg-sky-200 transition-all duration-300"
    >
      <span>
        <span className="block text-[10px] font-bold tracking-[0.3em] uppercase text-dg-sky-600 mb-1">{t.lab.playground}</span>
        <span className="block text-sm max-w-2xl">{t.lab.playgroundIntro}</span>
      </span>
      <span className="text-xs font-bold tracking-[0.25em] uppercase">{t.lab.openPlayground} →</span>
    </Link>
  );
}
