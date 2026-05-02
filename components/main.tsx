import Logo from "@/components/logo";
import Nav from "@/components/nav";
import { Page } from "@/config";
import Link from "next/link";

export default function Main({
  children,
  locale,
  page,
}: {
  children: React.ReactNode;
  locale: string | undefined;
  page: Page;
}) {
  return (
    <div className="min-h-screen bg-dg-canvas text-dg-ink">
      <header className="sticky top-0 z-50 bg-dg-canvas/95 backdrop-blur-sm border-b border-dg-border">
        <div className="max-w-[1400px] mx-auto w-full px-6 md:px-12 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-70 transition-opacity"
          >
            <Logo />
            <span className="text-sm font-bold tracking-[0.2em] uppercase hidden sm:inline">
              dirty-geometry
            </span>
          </Link>
          <Nav locale={locale} page={page} />
        </div>
      </header>
      <main className="px-8 md:px-16 lg:px-24 py-24">
        <div className="max-w-[1400px] mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
