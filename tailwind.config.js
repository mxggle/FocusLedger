import containerQueries from "@tailwindcss/container-queries";
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
            // Concentric scale on a 4px rhythm, so `parent - padding = child`
            // lands on a real token (Tahoe's defining corner treatment).
            borderRadius: {
                xs: "var(--radius-xs)",
                sm: "var(--radius-sm)",
                md: "var(--radius-md)",
                lg: "var(--radius-lg)",
                xl: "var(--radius-xl)",
                "2xl": "var(--radius-2xl)",
                full: "var(--radius-full)"
            },
            boxShadow: {
                xs: "var(--shadow-xs)",
                sm: "var(--shadow-sm)",
                card: "var(--shadow-card)",
                md: "var(--shadow-md)",
                pop: "var(--shadow-pop)",
                ring: "var(--ring-shadow)",
                glow: "var(--shadow-glow)",
                glass: "var(--shadow-glass)"
            },
            // San Francisco first — `-apple-system` resolves to SF Pro with correct
            // optical sizing, which is what makes the window read as native. Inter
            // remains the Windows/Linux fallback.
            fontFamily: {
                sans: [
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "SF Pro Text",
                    "SF Pro Display",
                    "ui-sans-serif",
                    "system-ui",
                    "Inter",
                    "Segoe UI",
                    "sans-serif"
                ],
                mono: [
                    "ui-monospace",
                    "SF Mono",
                    "SFMono-Regular",
                    "Menlo",
                    "monospace"
                ]
            },
            // macOS text styles. AppKit's body is 13px, not the 14px web default —
            // matching it is most of what separates a native-feeling window from a
            // web page in a frame. Larger sizes take negative tracking the way SF
            // Pro Display does.
            fontSize: {
                xs: ["11px", { lineHeight: "1.45" }], // caption / subheadline
                sm: ["12px", { lineHeight: "1.45" }], // callout
                base: ["13px", { lineHeight: "1.5" }], // body
                lg: ["15px", { lineHeight: "1.4" }], // title 3
                xl: ["17px", { lineHeight: "1.35", letterSpacing: "-0.01em" }], // title 2
                "2xl": ["22px", { lineHeight: "1.25", letterSpacing: "-0.015em" }], // title 1
                "3xl": ["26px", { lineHeight: "1.2", letterSpacing: "-0.02em" }], // large title
                timer: ["56px", { lineHeight: "1", letterSpacing: "-0.03em" }]
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
    plugins: [containerQueries]
};
export default config;
