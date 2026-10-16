import {
  baseUrl,
  defaultLocale,
  Locale,
  locales,
  Page,
  translations,
} from "@/config";

export const isValidLocale = (input: any): input is Locale =>
  locales.includes(input as Locale);

export const getLocale = (input?: string): Locale =>
  isValidLocale(input) ? input : defaultLocale;

export const getTranslations = (input?: string) =>
  translations[getLocale(input)];

const getPageSegment = (page?: Page) => {
  if (!page || page === "home") return "";
  if (page === "frame") return "entries/frame/";
  if (page === "vec2" || page === "graph") return `lab/${page}/`;
  return `${page}/`;
};

export const getPath = (locale: Locale, page?: Page) =>
  `/${locale === defaultLocale ? "" : `${locale}/`}${getPageSegment(page)}`;

/** Path of one lab demo, e.g. `/lab/vec2/curves/` or `/de/lab/graph/path-search/`. */
export const getDemoPath = (locale: Locale, library: string, id: string) =>
  `${getPath(locale, "lab")}${library}/${id}/`;

/** Path of the vec2 playground. */
export const getPlaygroundPath = (locale: Locale) => `${getPath(locale, "vec2")}playground/`;

/** Absolute URL of a site path (paths end in `/`, matching the trailing-slash export). */
export const getAbsoluteUrl = (path: string) => `${baseUrl}${path}`;

export const getUrl = (locale: Locale, page?: Page) => getAbsoluteUrl(getPath(locale, page));

export const state = { locale: defaultLocale };
