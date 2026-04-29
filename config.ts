import de from "./dictionaries/de.json";
import en from "./dictionaries/en.json";
import fr from "./dictionaries/fr.json";
import it from "./dictionaries/it.json";

export const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

/** URL prefix for subpath hosting (e.g. `/dirty-geometry`). Empty on apex or local dev. */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
export const basePath =
  rawBasePath && rawBasePath.startsWith("/")
    ? rawBasePath.replace(/\/$/, "")
    : "";
export const translations = { de, en, fr, it } as const;
export type Locale = keyof typeof translations;
export const locales = Object.keys(translations) as Locale[];
export const defaultLocale: Locale = "en" as const;

export const pages = ["home", "about", "frame"] as const;
export type Page = (typeof pages)[number];
