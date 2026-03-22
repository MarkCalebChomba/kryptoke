import type { Config } from "tailwindcss";

// Tailwind v4 note: most theme config has moved to @theme in globals.css.
// This file is kept only for content path configuration and plugin compatibility.
// In a future migration you can remove this file and use @source in globals.css instead.

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  // Theme is defined in styles/globals.css via @theme block
  // Adding it here too for IDEs and any remaining v3 compat
  theme: {
    extend: {
      colors: {
        bg:      { DEFAULT: "#080C14", surface: "#0E1420", surface2: "#141D2E" },
        border:  { DEFAULT: "#1C2840", 2: "#243250" },
        primary: { DEFAULT: "#00E5B4", dark: "#00B890" },
        gold:    "#F0B429",
        up:      "#00D68F",
        down:    "#FF4560",
        mpesa:   "#4CAF50",
        text: {
          primary:   "#F0F4FF",
          secondary: "#8A9CC0",
          muted:     "#4A5B7A",
        },
        // shadcn compat
        background: "#080C14",
        foreground: "#F0F4FF",
        card:       { DEFAULT: "#0E1420",  foreground: "#F0F4FF" },
        popover:    { DEFAULT: "#0E1420",  foreground: "#F0F4FF" },
        muted:      { DEFAULT: "#141D2E",  foreground: "#8A9CC0" },
        accent:     { DEFAULT: "#141D2E",  foreground: "#F0F4FF" },
        destructive:{ DEFAULT: "#FF4560",  foreground: "#F0F4FF" },
        input:      "#1C2840",
        ring:       "#00E5B4",
      },
      fontFamily: {
        syne:   ["var(--font-syne)",    "sans-serif"],
        outfit: ["var(--font-outfit)",  "sans-serif"],
        price:  ["var(--font-dm-mono)", "monospace"],
        sans:   ["var(--font-outfit)",  "sans-serif"],
        mono:   ["var(--font-dm-mono)", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      screens: { xs: "390px" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        shimmer:  { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        confetti: { "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" }, "100%": { transform: "translateY(100vh) rotate(720deg)", opacity: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        shimmer:          "shimmer 2s infinite linear",
        confetti:         "confetti 3s ease-in forwards",
        "pulse-slow":     "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #00E5B4 0%, #F0B429 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
