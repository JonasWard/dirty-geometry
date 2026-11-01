import { pages, type Page } from "@/config";
import { getLocale, getPath, getTranslations } from "@/utilities/l10n";
import Link from "next/link";

/** The site's pages, in a row (header) or a column (menu). */
export default function PageLinks({
  locale,
  page,
  vertical = false,
  className = "",
}: {
  locale: string | undefined;
  page: Page;
  vertical?: boolean;
  className?: string;
}) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  return (
    <nav aria-label="Pages" className={`flex ${vertical ? "flex-col gap-2" : "items-center gap-4"} ${className}`}>
      {pages.map((p) => (
        <Link
          key={p}
          href={getPath(activeLocale, p)}
          aria-current={p === page ? "page" : undefined}
          className={`text-xs tracking-widest uppercase font-medium transition-colors duration-200 ${
            p === page ? "text-dg-navy-900" : "text-dg-subtle hover:text-dg-steel-600"
          }`}
        >
          {t.pages[p]}
        </Link>
      ))}
    </nav>
  );
}
