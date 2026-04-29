import { locales, Page, pages } from "@/config";
import { getLocale, getPath, getTranslations } from "@/utilities/l10n";
import Link from "next/link";

const List = ({
  items,
}: {
  items: { active: boolean; href: string; text: string }[];
}) => {
  return (
    <div className="flex items-center gap-4">
      {items.map(({ active, href, text }) => (
        <Link
          className={`text-xs tracking-widest uppercase font-medium transition-colors duration-200 ${
            active ? "text-[#18181b]" : "text-[#aaa] hover:text-[#555]"
          }`}
          href={href}
          key={text}
        >
          {text}
        </Link>
      ))}
    </div>
  );
};

const Nav = ({
  locale,
  page,
}: {
  locale: string | undefined;
  page: Page;
}) => {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  return (
    <nav className="flex flex-col items-end gap-2">
      <List
        items={locales.map((l) => ({
          active: l === activeLocale,
          href: getPath(l, page),
          text: l,
        }))}
      />
      <List
        items={pages.map((p) => ({
          active: p === page,
          href: getPath(activeLocale, p),
          text: t.pages[p],
        }))}
      />
    </nav>
  );
};

export default Nav;
