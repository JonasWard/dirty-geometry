import Breadcrumbs from "@/components/breadcrumbs";
import { BackHome } from "@/components/lab/lab-hub";
import { ViewerClient } from "@/components/lab/playground-client";
import { basePath } from "@/config";
import { getLocale, getPath, getPlaygroundPath, getTranslations } from "@/utilities/l10n";
import Link from "next/link";

/** `/lab/vec2/playground/viewer/`: a playground link's definition, with only its input values to change. */
export default function ViewerPage({ locale }: { locale?: string }) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t.lab.home, href: getPath(activeLocale, "home") },
          { label: t.pages.lab, href: getPath(activeLocale, "lab") },
          { label: "vec2", href: getPath(activeLocale, "vec2") },
          { label: t.lab.playground, href: getPlaygroundPath(activeLocale) },
          { label: t.lab.viewer },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold mb-2">
          vec2 {t.lab.playground} — {t.lab.viewer}
        </h1>
        <p className="text-dg-muted leading-relaxed max-w-4xl">{t.lab.viewerIntro}</p>
      </div>
      <ViewerClient playgroundHref={`${basePath}${getPlaygroundPath(activeLocale)}`} />
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
