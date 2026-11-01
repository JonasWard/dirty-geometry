import type { Crumb } from "@/components/breadcrumbs";
import type { Page } from "@/config";
import { getDemoPath, getLocale, getPath, getPlaygroundPath, getTranslations } from "@/utilities/l10n";
import { demoLibraries, demoLibraryInfo, demosFor, type DemoLibrary } from "@dirty-geometry/visualisation/meta";

/** A page outside the lab: its name alone (the logo goes home). */
export function pageCrumbs(locale: string | undefined, page: Exclude<Page, "home">): Crumb[] {
  return [{ label: getTranslations(getLocale(locale)).pages[page] }];
}

/**
 * The lab's trail: Lab / library ▾ / page ▾. The library switches between the libraries; the page between the
 * library's playground (vec2) and its demos.
 */
export function labCrumbs(
  locale: string | undefined,
  at: { library?: DemoLibrary; demo?: string; playground?: boolean } = {},
): Crumb[] {
  const activeLocale = getLocale(locale);
  const t = getTranslations(activeLocale);
  const crumbs: Crumb[] = [{ label: t.pages.lab, href: getPath(activeLocale, "lab") }];
  const { library } = at;
  if (!library) return crumbs;
  crumbs.push({
    label: demoLibraryInfo[library].label,
    href: getPath(activeLocale, library),
    menu: demoLibraries.map((other) => ({
      label: demoLibraryInfo[other].label,
      href: getPath(activeLocale, other),
      current: other === library,
    })),
  });
  if (!at.demo && !at.playground) return crumbs;
  const menu = [
    ...(library === "vec2"
      ? [{ label: t.lab.playground, href: getPlaygroundPath(activeLocale), current: !!at.playground }]
      : []),
    ...demosFor(library).map((demo) => ({
      label: demo.label,
      href: getDemoPath(activeLocale, library, demo.id),
      current: demo.id === at.demo,
    })),
  ];
  crumbs.push({ label: menu.find((entry) => entry.current)?.label ?? "", menu });
  return crumbs;
}
