import Logo from "@/components/logo";
import Nav from "@/components/nav";
import { Page } from "@/config";
import { getTranslations } from "@/utilities/l10n";

const workItems = [
  { key: "item1" as const, bg: "#e8d8c3" },
  { key: "item2" as const, bg: "#c6d8c2" },
  { key: "item3" as const, bg: "#bfd0de" },
];

function GridPattern() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}

function StripesPattern() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern
          id="stripes"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="16"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="7"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#stripes)" />
    </svg>
  );
}

function DotsPattern() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern
          id="dots"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="10" cy="10" r="3.5" fill="rgba(0,0,0,0.18)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}

function PatternPreview({ index }: { index: number }) {
  if (index === 0) return <GridPattern />;
  if (index === 1) return <StripesPattern />;
  return <DotsPattern />;
}

export default function HomeBody({
  locale,
  page = "home",
}: {
  locale?: string;
  page?: Page;
}) {
  const t = getTranslations(locale);

  return (
    <div className="min-h-screen bg-[#f8f5f0] text-[#18181b]">
      <header className="sticky top-0 z-50 bg-[#f8f5f0] border-b border-[#e4ddd3]">
        <div className="max-w-[1400px] mx-auto w-full px-6 md:px-12 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-sm font-bold tracking-[0.2em] uppercase hidden sm:inline">
              dirty-geometry
            </span>
          </div>
          <Nav locale={locale} page={page} />
        </div>
      </header>

      <section className="relative flex flex-col justify-center px-8 md:px-16 lg:px-24 pt-20 pb-28 overflow-hidden min-h-[90vh]">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(24,24,27,0.05) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(24,24,27,0.05) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "60px 60px",
          }}
        />

        <div className="max-w-[1400px] mx-auto w-full relative z-10">
          <div className="relative">
            <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-[#c49a4a]">
              {t.home.hero.eyebrow}
            </p>
            <h1
              className="font-extrabold leading-[0.88] tracking-tight mb-6"
              style={{ fontSize: "clamp(4.5rem, 17vw, 15rem)" }}
            >
              {t.home.hero.heading}
            </h1>
            <p
              className="font-light text-[#777] mb-12"
              style={{ fontSize: "clamp(1.25rem, 2.5vw, 2.25rem)" }}
            >
              {t.home.hero.tagline}
            </p>
            <a
              href="#work"
              className="inline-flex items-center gap-3 border-2 border-[#18181b] px-8 py-4 text-xs font-bold tracking-[0.25em] uppercase hover:bg-[#18181b] hover:text-[#f8f5f0] transition-all duration-300"
            >
              {t.home.hero.cta} <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>

        <div
          className="absolute right-0 bottom-[-4vw] font-extrabold leading-none select-none pointer-events-none text-[#18181b] opacity-[0.025]"
          style={{ fontSize: "55vw" }}
          aria-hidden="true"
        >
          M
        </div>
      </section>

      <section
        id="work"
        className="border-t border-[#e4ddd3] px-8 md:px-16 lg:px-24 py-24"
      >
        <div className="max-w-[1400px] mx-auto">
          <p className="text-xs font-bold tracking-[0.45em] uppercase mb-16 text-[#c49a4a]">
            {t.home.problems.entries}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 lg:gap-12">
            {workItems.map(({ key, bg }, i) => {
              const item = t.home.problems[key];
              return (
                <article key={key}>
                  <div
                    className="aspect-square mb-5 overflow-hidden"
                    style={{ backgroundColor: bg }}
                  >
                    <PatternPreview index={i} />
                  </div>
                  <h3 className="text-sm font-bold tracking-wide uppercase mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[#777] leading-relaxed">
                    {item.desc}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e4ddd3] bg-[#18181b] text-[#f8f5f0] px-8 md:px-16 lg:px-24 py-28">
        <div className="max-w-[1400px] mx-auto">
          <h2
            className="font-bold leading-tight mb-10 max-w-2xl"
            style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}
          >
            {t.home.contact.heading}
          </h2>
          <a
            href="mailto:jonas@jonasward.ch"
            className="inline-flex items-center gap-3 border-2 border-[#f8f5f0] px-8 py-4 text-xs font-bold tracking-[0.25em] uppercase hover:bg-[#f8f5f0] hover:text-[#18181b] transition-all duration-300"
          >
            {t.home.contact.cta} <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <footer className="bg-[#18181b] border-t border-[#2a2a2a] px-8 md:px-16 lg:px-24 py-6 text-[#555] text-xs">
        <div className="max-w-[1400px] mx-auto w-full flex justify-between items-center">
          <span>© {new Date().getFullYear()} dirty-geometry</span>
          <span>jonasward.ch/dirty-geometry</span>
        </div>
      </footer>
    </div>
  );
}
