/** @type {import('next').NextConfig} */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
const basePath =
  rawBasePath && rawBasePath.startsWith("/")
    ? rawBasePath.replace(/\/$/, "")
    : undefined;

const nextConfig = {
  output: "export",
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true, // https://stackoverflow.com/a/72833238/3130281
  },
};

export default nextConfig;
