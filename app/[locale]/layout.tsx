import { defaultLocale, locales } from "@/config";
import { getLocale, isValidLocale, state } from "@/utilities/l10n";
import { notFound } from "next/navigation";
import type { Props } from "./route-params";

export type { LocaleParams, Props } from "./route-params";

export function generateStaticParams(): { locale: string }[] {
  return locales
    .filter((locale) => locale !== defaultLocale)
    .map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<Props & { children: React.ReactNode }>) {
  const { locale } = await params;
  if (!locale || !isValidLocale(locale)) {
    notFound();
  }
  const activeLocale = getLocale(locale);
  state.locale = activeLocale;
  return children;
}
