import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm cream theme (matches landing page)
        cream: { DEFAULT: "#F6F2EB", 100: "#FCFAF6", 200: "#EFE9DF", 300: "#E6DECF" },
        surface: { DEFAULT: "#FCFAF6", raised: "#FFFFFF", sunk: "#EFE9DF" },
        ink: { DEFAULT: "#1C1A16", 70: "#5A5448", 40: "#8C8576" },
        clay: { DEFAULT: "#C2613D", dark: "#A94E2E", soft: "#F0E2D8" },
        line: "#DBD3C5",
        severity: {
          green: "#22c55e",
          yellow: "#eab308",
          orange: "#f97316",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
