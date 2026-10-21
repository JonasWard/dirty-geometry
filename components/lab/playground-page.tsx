import InfoBox from "@/components/info-box";
import PlaygroundClient from "@/components/lab/playground-client";
import { getLocale, getTranslations } from "@/utilities/l10n";

/** `/lab/vec2/playground/`: the interactive definition builder, its description folded into an info box. */
export default function PlaygroundPage({ locale }: { locale?: string }) {
  const t = getTranslations(getLocale(locale));
  return (
    <section className="space-y-3">
      <InfoBox
        storageKey="dirty-geometry.playground.info"
        title={<h1 className="text-base font-bold">vec2 {t.lab.playground}</h1>}
      >
        <p className="max-w-4xl">{t.lab.playgroundIntro}</p>
      </InfoBox>
      <PlaygroundClient />
    </section>
  );
}
