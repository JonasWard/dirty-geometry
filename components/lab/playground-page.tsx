import PlaygroundClient from "@/components/lab/playground-client";
import { getLocale, getTranslations } from "@/utilities/l10n";

/** `/lab/vec2/playground/`: the interactive definition builder (its title is for screen readers; the tool speaks for itself). */
export default function PlaygroundPage({ locale }: { locale?: string }) {
  const t = getTranslations(getLocale(locale));
  return (
    <section className="space-y-3">
      <h1 className="sr-only">vec2 {t.lab.playground}</h1>
      <PlaygroundClient />
    </section>
  );
}
