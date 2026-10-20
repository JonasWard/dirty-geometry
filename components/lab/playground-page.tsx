import Breadcrumbs from "@/components/breadcrumbs";
import { BackHome } from "@/components/lab/lab-hub";
import PlaygroundClient from "@/components/lab/playground-client";
import { basePath } from "@/config";
import { getLocale, getPath, getTranslations, getViewerPath } from "@/utilities/l10n";
import Link from "next/link";

/** `/lab/vec2/playground/`: the interactive definition builder. */
export default function PlaygroundPage({ locale }: { locale?: string }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t.lab.home, href: getPath(activeLocale, "home") },
          { label: t.pages.lab, href: getPath(activeLocale, "lab") },
          { label: "vec2", href: getPath(activeLocale, "vec2") },
          { label: t.lab.playground },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold mb-2">vec2 {t.lab.playground}</h1>
        <p className="text-dg-muted leading-relaxed max-w-4xl">{t.lab.playgroundIntro}</p>
      </div>
      <PlaygroundClient viewerHref={`${basePath}${getViewerPath(activeLocale)}`} />
      <BackHome
        locale={activeLocale}
        extra={
          <Link
            href={getPath(activeLocale, "vec2")}
            className="text-xs font-bold tracking-[0.25em] uppercase text-dg-subtle hover:text-dg-steel-600 transition-colors duration-200"
          >
            vec2
          </Link>
        }
      />
    </section>
  );
}
