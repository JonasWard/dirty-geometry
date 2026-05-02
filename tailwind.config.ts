import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dg: {
          canvas: "#e6f0f9",
          surface: "#eef5fb",
          elevated: "#f6fafd",
          ink: "#061018",
          muted: "#5a6e82",
          subtle: "#8a9bab",
          border: "#c8d8e8",
          borderStrong: "#a8bcd4",
          navy: {
            950: "#020812",
            900: "#050c18",
            800: "#0f2744",
            700: "#1a3a5c",
          },
          steel: {
            700: "#1a4a72",
            600: "#2d5580",
            500: "#3d6a9e",
          },
          sky: {
            600: "#4a9ec4",
            500: "#5eb0d4",
            400: "#7ec8e8",
            200: "#b8e8ff",
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
