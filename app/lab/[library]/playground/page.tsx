import PlaygroundPage from "@/components/lab/playground-page";
import Main from "@/components/main";
import { defaultLocale } from "@/config";
import { getTranslations } from "@/utilities/l10n";
import { Metadata } from "next";

export const dynamicParams = false;
/** Only vec2 has a playground. */
export const generateStaticParams = () => [{ library: "vec2" }];

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslations(defaultLocale);
  return { title: `vec2 ${t.lab.playground} — ${t.home.meta.title}`, description: t.lab.playgroundIntro };
}

export default function Playground() {
  return (
    <Main locale={defaultLocale} page="vec2">
      <PlaygroundPage locale={defaultLocale} />
    </Main>
  );
}
