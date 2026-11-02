import PlaygroundPage from "@/components/lab/playground-page";
import { labCrumbs } from "@/components/lab/crumbs";
import Main from "@/components/main";
import { getTranslations } from "@/utilities/l10n";
import { Metadata, Viewport } from "next";

type Props = { params: Promise<{ locale?: string }> };

export const dynamicParams = false;
/** The playground is a tool, not a page to read: the page itself does not zoom (the node canvas zooms on its own). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };
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
    <Main locale={locale} page="vec2" wide crumbs={labCrumbs(locale, { library: "vec2", playground: true })}>
      <PlaygroundPage locale={locale} />
    </Main>
  );
}
