import { defaultLocale, locales, pages } from "@/config";
import { getAbsoluteUrl, getDemoPath, getUrl } from "@/utilities/l10n";
import { visualisationMetas } from "@dirty-geometry/visualisation/meta";
import { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const demoPages = visualisationMetas.map((demo) => ({
    url: getAbsoluteUrl(getDemoPath(defaultLocale, demo.library, demo.id)),
    lastModified: new Date(),
    priority: 0.4,
    alternates: {
      languages: Object.fromEntries(
        locales
          .filter((l) => l !== defaultLocale)
          .map((l) => [l, getAbsoluteUrl(getDemoPath(l, demo.library, demo.id))])
      ),
    },
  }));
  const sitePages = pages.map((p) => ({
    url: getUrl(defaultLocale, p),
    lastModified: new Date(),
    priority: p === "home" ? 1 : 0.5,
    alternates: {
      languages: Object.fromEntries(
        locales.filter((l) => l !== defaultLocale).map((l) => [l, getUrl(l, p)])
      ),
    },
  }));
  return [...sitePages, ...demoPages];
}
