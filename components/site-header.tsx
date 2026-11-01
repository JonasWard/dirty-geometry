import Breadcrumbs, { type Crumb } from "@/components/breadcrumbs";
import { HeaderMenu, LocaleSwitch } from "@/components/header-controls";
import Logo from "@/components/logo";
import PageLinks from "@/components/nav";
import { defaultLocale, locales, type Page } from "@/config";
import { getLocale, getPath, getTranslations } from "@/utilities/l10n";
import Link from "next/link";

/**
 * The sticky header: logo, the breadcrumb (beside the logo from `md`, in a thin row of its own below that), and the
 * page links and languages (inline from `xl`, behind ☰ below that).
 */
export default function SiteHeader({
  locale,
  page,
  crumbs,
  wide = false,
}: {
  locale: string | undefined;
  page: Page;
  crumbs?: readonly Crumb[];
  wide?: boolean;
}) {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  const width = wide ? "w-full" : "max-w-[1400px] mx-auto w-full";
  const languages = { locales, defaultLocale, active: activeLocale };
  return (
    <header className="sticky top-0 z-50 bg-dg-canvas/95 backdrop-blur-sm border-b border-dg-border">
      <div className={`${width} flex h-12 items-center gap-4 px-4 md:px-8`}>
        <Link
          href={getPath(activeLocale, "home")}
          className="flex shrink-0 items-center gap-2.5 hover:opacity-70 transition-opacity"
        >
          <Logo size={28} />
          <span className="text-sm font-bold tracking-[0.2em] uppercase hidden sm:inline">dirty-geometry</span>
        </Link>
        {crumbs && crumbs.length > 0 && (
          <>
            <span aria-hidden="true" className="hidden md:block h-5 w-px bg-dg-border" />
            <Breadcrumbs items={crumbs} className="hidden md:block" />
          </>
        )}
        <div className="ml-auto flex items-center gap-5">
          <PageLinks locale={activeLocale} page={page} className="hidden xl:flex" />
          <LocaleSwitch {...languages} className="hidden xl:flex" />
          <HeaderMenu label={t.nav.menu} className="xl:hidden">
            <PageLinks locale={activeLocale} page={page} vertical />
            <LocaleSwitch {...languages} className="mt-3 border-t border-dg-border pt-3" />
          </HeaderMenu>
        </div>
      </div>
      {crumbs && crumbs.length > 0 && (
        <div className="md:hidden flex h-9 items-center overflow-x-auto border-t border-dg-border px-4">
          <Breadcrumbs items={crumbs} />
        </div>
      )}
    </header>
  );
}
