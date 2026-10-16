import PlaygroundPage from "@/components/lab/playground-page";
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
  return { title: `vec2 ${t.lab.playground} — ${t.home.meta.title}`, description: t.lab.playgroundIntro };
}

export default async function Playground({ params }: Readonly<Props>) {
  const { locale } = await params;
  return (
    <Main locale={locale} page="vec2">
      <PlaygroundPage locale={locale} />
    </Main>
  );
}
