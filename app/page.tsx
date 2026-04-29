import HomeBody from "@/components/home-body";
import { defaultLocale } from "@/config";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslations(defaultLocale);
  return {
    title: t.home.meta.title,
    description: t.home.meta.description,
  };
}

export default function Home() {
  return <HomeBody locale={defaultLocale} />;
}
