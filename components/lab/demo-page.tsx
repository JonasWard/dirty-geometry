import DemoCanvas from "@/components/lab/demo-canvas";
import { getDemoPath, getLocale, getTranslations } from "@/utilities/l10n";
import { demosFor, type DemoMeta } from "@dirty-geometry/visualisation/meta";
import Link from "next/link";

const linkClass =
  "text-xs font-bold tracking-[0.2em] uppercase text-dg-subtle hover:text-dg-steel-600 transition-colors duration-200";

/** `/lab/<library>/<demo>/`: one demo; the header's trail switches between its siblings. */
export default function DemoPage({ locale, demo }: { locale?: string; demo: DemoMeta }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  const siblings = demosFor(demo.library);
  const index = siblings.findIndex((sibling) => sibling.id === demo.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const pathFor = (target: DemoMeta) => getDemoPath(activeLocale, target.library, target.id);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold mb-1">{demo.title}</h1>
        <p className="text-sm text-dg-muted leading-relaxed max-w-4xl">{demo.description}</p>
      </div>

      <DemoCanvas library={demo.library} id={demo.id} />

      <nav className="flex flex-wrap justify-between gap-4" aria-label={t.lab.allDemos}>
        {previous ? (
          <Link href={pathFor(previous)} className={linkClass}>
            ← {previous.label}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={pathFor(next)} className={linkClass}>
            {next.label} →
          </Link>
        )}
      </nav>
    </section>
  );
}
