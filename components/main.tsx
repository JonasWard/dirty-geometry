import type { Crumb } from "@/components/breadcrumbs";
import SiteHeader from "@/components/site-header";
import { Page } from "@/config";

/** A page with the site header; `wide` drops the content's width cap (tools like the playground). */
export default function Main({
  children,
  locale,
  page,
  crumbs,
  wide = false,
}: {
  children: React.ReactNode;
  locale: string | undefined;
  page: Page;
  crumbs?: readonly Crumb[];
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-dg-canvas text-dg-ink">
      <SiteHeader locale={locale} page={page} crumbs={crumbs} wide={wide} />
      <main className="px-4 md:px-8 py-6 md:py-8">
        <div className={wide ? "w-full" : "max-w-[1400px] mx-auto w-full"}>{children}</div>
      </main>
    </div>
  );
}
