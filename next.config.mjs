/** @type {import('next').NextConfig} */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
const basePath =
  rawBasePath && rawBasePath.startsWith("/")
    ? rawBasePath.replace(/\/$/, "")
    : undefined;
const isProduction = process.env.NODE_ENV === "production";
// Absolute site URL for the sitemap and robots.txt: SITE_URL when given, Render's own URL when built on
// Render (it sets RENDER and RENDER_EXTERNAL_URL), otherwise NEXT_PUBLIC_BASE_URL from the .env files.
const baseUrl = (
  process.env.SITE_URL?.trim() ||
  (process.env.RENDER ? process.env.RENDER_EXTERNAL_URL?.trim() : "") ||
  process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
  ""
).replace(/\/$/, "");

const nextConfig = {
  // Keep static export constraints only for production builds.
  // In dev, this prevents dynamic-segment export errors on unknown URLs.
  ...(isProduction ? { output: "export" } : {}),
  ...(basePath ? { basePath } : {}),
  // Export every route as <route>/index.html, which any static host (Render, GitHub Pages) serves.
  trailingSlash: true,
  env: { NEXT_PUBLIC_BASE_URL: baseUrl },
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: [
    "@dirty-geometry/vec2",
    "@dirty-geometry/graph",
    "@dirty-geometry/visualisation",
  ],
  images: {
    unoptimized: true, // https://stackoverflow.com/a/72833238/3130281
  },
};

export default nextConfig;
