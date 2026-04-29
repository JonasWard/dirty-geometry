import HomeBody from "@/components/home-body";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";
import type { Props } from "./route-params";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = getTranslations(locale);
  return {
    title: t.home.meta.title,
    description: t.home.meta.description,
  };
}

export default async function Home({ params }: Readonly<Props>) {
  const { locale } = await params;
  return <HomeBody locale={locale} />;
}
