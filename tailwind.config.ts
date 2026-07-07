import type { Config } from "tailwindcss";

// shadcn colors map to prefixed `--sc-*` CSS vars so they never collide with the
// legacy hand-rolled tokens (--border/--muted/--accent) during the staged
// migration. Values are HSL triplets so opacity modifiers (bg-primary/90) work.
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--sc-border))",
        input: "hsl(var(--sc-input))",
        ring: "hsl(var(--sc-ring))",
        background: "hsl(var(--sc-background))",
        foreground: "hsl(var(--sc-foreground))",
        primary: {
          DEFAULT: "hsl(var(--sc-primary))",
          foreground: "hsl(var(--sc-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--sc-secondary))",
          foreground: "hsl(var(--sc-secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--sc-destructive))",
          foreground: "hsl(var(--sc-destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--sc-muted))",
          foreground: "hsl(var(--sc-muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--sc-accent))",
          foreground: "hsl(var(--sc-accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--sc-popover))",
          foreground: "hsl(var(--sc-popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--sc-card))",
          foreground: "hsl(var(--sc-card-foreground))",
        },
        warn: { DEFAULT: "hsl(var(--sc-warn))" },
      },
      borderRadius: {
        lg: "var(--sc-radius)",
        md: "calc(var(--sc-radius) - 2px)",
        sm: "calc(var(--sc-radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-brand)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
