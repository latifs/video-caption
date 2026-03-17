const { hairlineWidth } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "rgba(255,255,255,0.1)",
        input: "rgba(255,255,255,0.1)",
        background: "#0F0F1A",
        foreground: "#ffffff",
        primary: {
          DEFAULT: "#8B5CF6",
          foreground: "#ffffff",
          muted: "rgba(139,92,246,0.15)",
        },
        secondary: {
          DEFAULT: "rgba(255,255,255,0.08)",
          foreground: "#ffffff",
        },
        destructive: {
          DEFAULT: "#FF3B30",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#1A1A2E",
          foreground: "rgba(255,255,255,0.5)",
        },
        accent: {
          DEFAULT: "#A78BFA",
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "#1C1C2E",
          foreground: "#ffffff",
        },
        popover: {
          DEFAULT: "#1E1E1E",
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#34C759",
        },
        overlay: "rgba(0,0,0,0.5)",
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
