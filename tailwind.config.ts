import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        sand: "#f7f3ec",
        ink: "#111111",
        accent: "#b28b52",
        background: {
          DEFAULT: "#000000",
          elevated: "#0F0F0F",
          hover: "#1A1A1A"
        },
        text: {
          primary: "#FFFFFF",
          secondary: "rgba(255, 255, 255, 0.7)",
          muted: "rgba(255, 255, 255, 0.5)"
        },
        border: {
          DEFAULT: "#2A2A2A",
          hover: "#3A3A3A"
        },
        primary: {
          DEFAULT: "#C8A060",
          light: "#E8D7BE",
          dark: "#A68850",
          50: "#FAF8F5",
          100: "#F5F0E8",
          200: "#E8D7BE",
          300: "#DBBF94",
          400: "#CEA76A",
          500: "#C8A060",
          600: "#A68850",
          700: "#7D6640",
          800: "#544430",
          900: "#2B2220"
        },
        success: {
          50: "#F0FDF4",
          100: "#DCFCE7",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46"
        },
        danger: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
          800: "#991B1B"
        },
        warning: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E"
        },
        info: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF"
        }
      },
      fontFamily: {
        playfair: ["var(--font-playfair)", "Playfair Display", "serif"],
        sans: ["system-ui", "-apple-system", "sans-serif"]
      },
      letterSpacing: {
        wide: "0.08em",
        wider: "0.12em"
      },
      boxShadow: {
        subtle: "0 15px 45px rgba(0,0,0,0.05)"
      }
    }
  },
  plugins: []
};

export default config;
