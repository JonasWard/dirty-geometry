import AboutBody from "@/components/about-body";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";
import Main from "@/components/main";
import type { Props } from "../route-params";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = getTranslations(locale);
  return {
    title: `${t.pages.about} — ${t.home.meta.title}`,
    description: t.about.meta.description,
  };
}

export default async function About({ params }: Readonly<Props>) {
  const { locale } = await params;
  return (
    <Main locale={locale} page="about">
      <AboutBody locale={locale} />
    </Main>
  );
}
