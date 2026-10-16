import Breadcrumbs from "@/components/breadcrumbs";
import DemoCard from "@/components/lab/demo-card";
import { BackHome } from "@/components/lab/lab-hub";
import { getDemoPath, getLocale, getPath, getTranslations } from "@/utilities/l10n";
import { demoLibraryInfo, demosFor, type DemoLibrary } from "@dirty-geometry/visualisation/meta";
import Link from "next/link";

/** `/lab/<library>/`: one library's demos. */
export default function LibraryIndex({ locale, library }: { locale?: string; library: DemoLibrary }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  const info = demoLibraryInfo[library];

  return (
    <div className="space-y-12">
      <Breadcrumbs
        items={[
          { label: t.lab.home, href: getPath(activeLocale, "home") },
          { label: t.pages.lab, href: getPath(activeLocale, "lab") },
          { label: info.label },
        ]}
      />
      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-dg-sky-600">{t.lab.eyebrow}</p>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-4">{info.label}</h1>
        <p className="text-sm text-dg-subtle mb-4">
          <code>{info.packageName}</code>
        </p>
        <p className="text-lg text-dg-muted leading-relaxed">{t.lab.libraries[library]}</p>
      </section>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {demosFor(library).map((demo) => (
          <DemoCard key={demo.id} demo={demo} href={getDemoPath(activeLocale, library, demo.id)} />
        ))}
      </div>
      <BackHome
        locale={activeLocale}
        extra={
          <Link
            href={getPath(activeLocale, "lab")}
            className="text-xs font-bold tracking-[0.25em] uppercase text-dg-subtle hover:text-dg-steel-600 transition-colors duration-200"
          >
            {t.lab.allDemos}
          </Link>
        }
      />
    </div>
  );
}
