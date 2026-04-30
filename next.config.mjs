/** @type {import('next').NextConfig} */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
const basePath =
  rawBasePath && rawBasePath.startsWith("/")
    ? rawBasePath.replace(/\/$/, "")
    : undefined;
const isProduction = process.env.NODE_ENV === "production";

const nextConfig = {
  // Keep static export constraints only for production builds.
  // In dev, this prevents dynamic-segment export errors on unknown URLs.
  ...(isProduction ? { output: "export" } : {}),
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true, // https://stackoverflow.com/a/72833238/3130281
  },
};

export default nextConfig;
