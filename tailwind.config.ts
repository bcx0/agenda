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
        primary: {
          DEFAULT: '#1d4567',
          dark: '#152f48',
          light: '#2a5f8f',
          50: '#eef2f7',
          100: '#d8e2ed',
          200: '#b1c5db',
          300: '#7fa0c2',
          400: '#4d7ba8',
          500: '#1d4567',
          600: '#193b58',
          700: '#152f48',
          800: '#102339',
          900: '#0b1829'
        },
        accent: {
          DEFAULT: '#c0392b',
          light: '#d9391f',
          soft: '#a86962',
          50: '#fef2f0',
          100: '#fce0dc',
          200: '#f5b3aa',
          300: '#e87f72',
          400: '#d9391f',
          500: '#c0392b',
          600: '#a03024',
          700: '#80261d',
          800: '#601c15',
          900: '#40120e'
        },
        surface: '#eef2f7',
        border: '#d8dee6',
        gray: {
          50: '#f5f7fa',
          100: '#eef2f7',
          200: '#d8dee6',
          500: '#5a6677',
          700: '#1a1a2e'
        },
        background: {
          DEFAULT: '#000000',
          elevated: '#0F0F0F',
          hover: '#1A1A1A'
        },
        text: {
          primary: '#FFFFFF',
          secondary: 'rgba(255, 255, 255, 0.7)',
          muted: 'rgba(255, 255, 255, 0.5)'
        },
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46'
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B'
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E'
        },
        info: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF'
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
