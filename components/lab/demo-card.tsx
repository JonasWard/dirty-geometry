import type { DemoMeta } from "@dirty-geometry/visualisation/meta";
import Link from "next/link";

/** Card linking to one demo page; metadata only, so it renders without three.js. */
export default function DemoCard({ demo, href }: { demo: DemoMeta; href: string }) {
  return (
    <Link
      href={href}
      className="group block border border-dg-border p-5 hover:border-dg-steel-600 transition-colors duration-200"
    >
      <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-dg-sky-600 mb-2">{demo.label}</p>
      <h3 className="text-base font-bold mb-2 group-hover:text-dg-steel-600 transition-colors duration-200">
        {demo.title}
      </h3>
      <p className="text-sm text-dg-muted leading-relaxed line-clamp-3">{demo.description}</p>
    </Link>
  );
}
