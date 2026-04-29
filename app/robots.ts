import { basePath, baseUrl } from "@/config";
import { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: basePath ? `${basePath}/` : "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
