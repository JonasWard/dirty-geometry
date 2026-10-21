import { getTranslations } from "@/utilities/l10n";

export default function AboutBody({ locale }: { locale?: string }) {
  const t = getTranslations(locale);
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold tracking-[0.35em] uppercase mb-2 text-dg-sky-600">
        {t.pages.about}
      </p>
      <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight mb-6">
        {t.about.heading}
      </h1>
      <div
        className="text-lg text-dg-muted leading-relaxed"
        dangerouslySetInnerHTML={{ __html: t.about.subheading }}
      />
    </div>
  );
}
