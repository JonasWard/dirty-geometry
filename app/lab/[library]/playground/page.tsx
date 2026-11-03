import PlaygroundPage from "@/components/lab/playground-page";
import { labCrumbs } from "@/components/lab/crumbs";
import Main from "@/components/main";
import { defaultLocale } from "@/config";
import { getTranslations } from "@/utilities/l10n";
import { Metadata, Viewport } from "next";

export const dynamicParams = false;
/** The playground is a tool, not a page to read: the page itself does not zoom (the node canvas zooms on its own). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };
/** Only vec2 has a playground. */
export const generateStaticParams = () => [{ library: "vec2" }];

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslations(defaultLocale);
  return { title: `vec2 ${t.lab.playground} — ${t.home.meta.title}`, description: t.lab.playgroundIntro };
}

export default function Playground() {
  return (
    <Main locale={defaultLocale} page="vec2" wide crumbs={labCrumbs(defaultLocale, { library: "vec2", playground: true })}>
      <PlaygroundPage locale={defaultLocale} />
    </Main>
  );
}
