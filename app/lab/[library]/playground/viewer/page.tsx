import ViewerPage from "@/components/lab/viewer-page";
import Main from "@/components/main";
import { defaultLocale } from "@/config";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";

export const dynamicParams = false;
/** Only vec2 has a playground. */
export const generateStaticParams = () => [{ library: "vec2" }];

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslations(defaultLocale);
  return { title: `vec2 ${t.lab.viewer} — ${t.home.meta.title}`, description: t.lab.viewerIntro };
}

export default function Viewer() {
  return (
    <Main locale={defaultLocale} page="vec2">
      <ViewerPage locale={defaultLocale} />
    </Main>
  );
}
