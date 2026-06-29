# Yolo — Marketing Site

The official landing page for **Yolo**. This is a **standalone** project: it has
its own dependencies and build, and is **completely separate from the desktop
app** — it is never bundled into the Tauri package.

- **Stack:** Vite + React 18 + TypeScript + Tailwind CSS + Framer Motion
- **Design:** mirrors the app's exact design tokens (`tailwind.config.js` /
  `src/index.css`) so the site looks like the product. Light + dark themes.
- **Mockups:** the product screens are recreated as HTML/CSS in
  `src/components/mockups/` — no external screenshot assets required.

## Develop

```bash
cd website
npm install      # or: yarn / pnpm install
npm run dev      # http://localhost:3000
npm run build    # type-check + emit to website/dist
npm run preview  # preview the production build
```

> Run all commands **from inside `website/`** — never from the repo root, so the
> app's own `node_modules` / build are untouched.

## Deploy to Vercel

The site is a static SPA. Two equivalent options:

1. **Set the Root Directory to `website`** in the Vercel project settings.
   Vercel auto-detects Vite (`npm run build` → `dist`).
2. Or import the repo as-is — `website/vercel.json` declares the framework,
   build command, and output directory.

No environment variables are required.

## Customize

Product copy, links, and **download targets** live in one file:
[`src/lib/site.ts`](src/lib/site.ts). Point `DOWNLOAD.*` at your real signed
installers / release page when you publish.

## Why it's isolated from the app

- The Tauri app builds from the repo root (`index.html` + `src/`) into `../dist`;
  `website/` is a sibling directory the app's Vite/`tsc` config never includes.
- `website/node_modules` and `website/dist` are gitignored.
- Result: shipping the desktop app never bundles any of this site's code.
