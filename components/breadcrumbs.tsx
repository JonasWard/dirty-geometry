import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** "Home / Lab / vec2 / Curves": every crumb but the last is a link. */
export default function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs tracking-widest uppercase font-medium">
      <ol className="flex flex-wrap items-center gap-2 text-dg-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-dg-steel-600 transition-colors duration-200">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-dg-navy-900" : undefined}>
                  {item.label}
                </span>
              )}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
