var config = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                border: {
                    DEFAULT: "hsl(var(--border))",
                    strong: "hsl(var(--border-strong))"
                },
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                surface: {
                    DEFAULT: "hsl(var(--surface))",
                    2: "hsl(var(--surface-2))"
                },
                elevated: "hsl(var(--elevated))",
                foreground: "hsl(var(--foreground))",
                subtle: "hsl(var(--subtle-foreground))",
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))"
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                    hover: "hsl(var(--primary-hover))",
                    soft: "hsl(var(--primary-soft))",
                    "soft-foreground": "hsl(var(--primary-soft-foreground))"
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                    soft: "hsl(var(--destructive-soft))",
                    "soft-foreground": "hsl(var(--destructive-soft-foreground))"
                },
                success: {
                    DEFAULT: "hsl(var(--success))",
                    foreground: "hsl(var(--success-foreground))",
                    soft: "hsl(var(--success-soft))",
                    "soft-foreground": "hsl(var(--success-soft-foreground))"
                },
                warning: {
                    DEFAULT: "hsl(var(--warning))",
                    foreground: "hsl(var(--warning-foreground))",
                    soft: "hsl(var(--warning-soft))",
                    "soft-foreground": "hsl(var(--warning-soft-foreground))"
                }
            },
            borderRadius: {
                sm: "var(--radius-sm)",
                md: "var(--radius-md)",
                lg: "var(--radius-lg)",
                xl: "var(--radius-xl)",
                full: "var(--radius-full)"
            },
            boxShadow: {
                xs: "var(--shadow-xs)",
                sm: "var(--shadow-sm)",
                card: "var(--shadow-card)",
                md: "var(--shadow-md)",
                pop: "var(--shadow-pop)",
                ring: "var(--ring-shadow)"
            },
            fontFamily: {
                sans: [
                    "Inter",
                    "ui-sans-serif",
                    "system-ui",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "sans-serif"
                ]
            },
            fontSize: {
                xs: ["12px", { lineHeight: "1.5" }],
                sm: ["13px", { lineHeight: "1.5" }],
                base: ["14px", { lineHeight: "1.6" }],
                lg: ["16px", { lineHeight: "1.5" }],
                xl: ["20px", { lineHeight: "1.4" }],
                "2xl": ["24px", { lineHeight: "1.3" }],
                "timer": ["56px", { lineHeight: "1", letterSpacing: "-0.02em" }]
            },
            transitionTimingFunction: {
                DEFAULT: "var(--ease)",
                spring: "var(--ease-spring)"
            },
            transitionDuration: {
                fast: "var(--duration-fast)",
                normal: "var(--duration-normal)"
            },
            keyframes: {
                "slide-up-fade": {
                    "0%": { opacity: "0", transform: "translateY(8px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" }
                },
                "slide-down-fade": {
                    "0%": { opacity: "1", transform: "translateY(0)" },
                    "100%": { opacity: "0", transform: "translateY(8px)" }
                },
                "fade-in": {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" }
                },
                "fade-out": {
                    "0%": { opacity: "1" },
                    "100%": { opacity: "0" }
                },
                "dialog-in": {
                    "0%": { opacity: "0", transform: "scale(0.96) translateY(4px)" },
                    "100%": { opacity: "1", transform: "scale(1) translateY(0)" }
                },
                "dialog-out": {
                    "0%": { opacity: "1", transform: "scale(1) translateY(0)" },
                    "100%": { opacity: "0", transform: "scale(0.96) translateY(4px)" }
                },
                "scale-in": {
                    "0%": { opacity: "0", transform: "scale(0.95)" },
                    "100%": { opacity: "1", transform: "scale(1)" }
                },
                shimmer: {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" }
                }
            },
            animation: {
                "slide-up-fade": "slide-up-fade 220ms var(--ease) both",
                "fade-in": "fade-in 150ms ease both",
                "fade-out": "fade-out 120ms ease both",
                "dialog-in": "dialog-in 200ms var(--ease) both",
                "dialog-out": "dialog-out 140ms var(--ease) both",
                "scale-in": "scale-in 140ms var(--ease) both",
                shimmer: "shimmer 1.6s infinite linear"
            }
        }
    },
    plugins: []
};
export default config;
