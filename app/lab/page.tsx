import LabBody from "@/components/lab/lab-body";
import { defaultLocale } from "@/config";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";
import Main from "@/components/main";

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslations(defaultLocale);
  return {
    title: `${t.pages.lab} — ${t.home.meta.title}`,
    description: "Interactive demos of the vec2 2D geometry library.",
  };
}

export default function Lab() {
  return (
    <Main locale={defaultLocale} page="lab">
      <LabBody />
    </Main>
  );
}
