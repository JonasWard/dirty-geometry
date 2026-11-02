import PlaygroundClient from "@/components/lab/playground-client";
import { getLocale, getTranslations } from "@/utilities/l10n";

/** `/lab/vec2/playground/`: the interactive definition builder; its description is the playground's help. */
export default function PlaygroundPage({ locale }: { locale?: string }) {
  const t = getTranslations(getLocale(locale));
  return (
    <section>
      <PlaygroundClient
        about={{
          title: <h1 className="text-base font-bold">vec2 {t.lab.playground}</h1>,
          body: <p>{t.lab.playgroundIntro}</p>,
        }}
      />
    </section>
  );
}
