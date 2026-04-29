import AboutBody from "@/components/about-body";
import { defaultLocale } from "@/config";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";
import Main from "@/components/main";

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslations(defaultLocale);
  return {
    title: `${t.pages.about} — ${t.home.meta.title}`,
    description: t.about.meta.description,
  };
}

export default function About() {
  return (
    <Main locale={defaultLocale} page="about">
      <AboutBody locale={defaultLocale} />
    </Main>
  );
}
