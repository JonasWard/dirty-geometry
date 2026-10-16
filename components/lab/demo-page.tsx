import Breadcrumbs from "@/components/breadcrumbs";
import DemoCanvas from "@/components/lab/demo-canvas";
import { BackHome } from "@/components/lab/lab-hub";
import { getDemoPath, getLocale, getPath, getTranslations } from "@/utilities/l10n";
import { demoLibraryInfo, demosFor, type DemoMeta } from "@dirty-geometry/visualisation/meta";
import Link from "next/link";

const linkClass =
  "text-xs font-bold tracking-[0.25em] uppercase text-dg-subtle hover:text-dg-steel-600 transition-colors duration-200";

/** `/lab/<library>/<demo>/`: one demo with links to its siblings, the lab and home. */
export default function DemoPage({ locale, demo }: { locale?: string; demo: DemoMeta }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  const info = demoLibraryInfo[demo.library];
  const siblings = demosFor(demo.library);
  const index = siblings.findIndex((sibling) => sibling.id === demo.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const pathFor = (target: DemoMeta) => getDemoPath(activeLocale, target.library, target.id);

  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t.lab.home, href: getPath(activeLocale, "home") },
          { label: t.pages.lab, href: getPath(activeLocale, "lab") },
          { label: info.label, href: getPath(activeLocale, demo.library) },
          { label: demo.label },
        ]}
      />

      <nav className="flex flex-wrap gap-2" aria-label={`${info.label} demos`}>
        {siblings.map((sibling) => {
          const selected = sibling.id === demo.id;
          return (
            <Link
              key={sibling.id}
              href={pathFor(sibling)}
              aria-current={selected ? "page" : undefined}
              className={`border px-3 py-1.5 text-xs tracking-widest uppercase font-medium transition-colors duration-200 ${
                selected
                  ? "border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200"
                  : "border-dg-border text-dg-subtle hover:border-dg-steel-600 hover:text-dg-steel-600"
              }`}
            >
              {sibling.label}
            </Link>
          );
        })}
      </nav>

      <div>
        <h1 className="text-2xl font-bold mb-2">{demo.title}</h1>
        <p className="text-dg-muted leading-relaxed max-w-4xl">{demo.description}</p>
      </div>

      <DemoCanvas library={demo.library} id={demo.id} />

      <div className="flex flex-wrap justify-between gap-4">
        {previous ? (
          <Link href={pathFor(previous)} className={linkClass}>
            ← {t.lab.previous}: {previous.label}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={pathFor(next)} className={linkClass}>
            {t.lab.next}: {next.label} →
          </Link>
        )}
      </div>

      <BackHome
        locale={activeLocale}
        extra={
          <>
            <Link href={getPath(activeLocale, demo.library)} className={linkClass}>
              {info.label}
            </Link>
            <Link href={getPath(activeLocale, "lab")} className={linkClass}>
              {t.lab.allDemos}
            </Link>
          </>
        }
      />
    </section>
  );
}
