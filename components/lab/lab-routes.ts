import { getTranslations } from "@/utilities/l10n";
import { demoLibraries, demoLibraryInfo, findDemo, isDemoLibrary, visualisationMetas } from "@dirty-geometry/visualisation/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** Static params and metadata shared by the root and localized lab routes. */
export const libraryParams = () => demoLibraries.map((library) => ({ library }));

export const demoParams = () => visualisationMetas.map((demo) => ({ library: demo.library, demo: demo.id }));

export function labMetadata(locale?: string): Metadata {
  const t = getTranslations(locale);
  return { title: `${t.pages.lab} — ${t.home.meta.title}`, description: t.lab.intro };
}

export function libraryMetadata(library: string, locale?: string): Metadata {
  const t = getTranslations(locale);
  if (!isDemoLibrary(library)) return {};
  return {
    title: `${demoLibraryInfo[library].label} — ${t.pages.lab} — ${t.home.meta.title}`,
    description: t.lab.libraries[library],
  };
}

export function demoMetadata(library: string, id: string, locale?: string): Metadata {
  const t = getTranslations(locale);
  const demo = findDemo(library, id);
  if (!demo) return {};
  return {
    title: `${demo.title} — ${demoLibraryInfo[demo.library].label} — ${t.home.meta.title}`,
    description: demo.description,
  };
}

export function requireLibrary(library: string) {
  if (!isDemoLibrary(library)) notFound();
  return library;
}

export function requireDemo(library: string, id: string) {
  const demo = findDemo(library, id);
  if (!demo) notFound();
  return demo;
}
