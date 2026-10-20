import ViewerPage from "@/components/lab/viewer-page";
import Main from "@/components/main";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";

type Props = { params: Promise<{ locale?: string }> };

export const dynamicParams = false;
/** Only vec2 has a playground. */
export const generateStaticParams = () => [{ library: "vec2" }];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = getTranslations(locale);
  return { title: `vec2 ${t.lab.viewer} — ${t.home.meta.title}`, description: t.lab.viewerIntro };
}

export default async function Viewer({ params }: Readonly<Props>) {
  const { locale } = await params;
  return (
    <Main locale={locale} page="vec2">
      <ViewerPage locale={locale} />
    </Main>
  );
}
