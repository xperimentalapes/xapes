# Homepage (dashboard) setup

The marketing/dashboard site lives in **`site-template/`**. Vercel and local **`npm start`** serve the built copy under **`public/`** (plus game HTML/JS from the repo root).

## Layout

| Path | Purpose |
|------|--------|
| **`site-template/js/config.js`** | `window.XAPES_CONFIG` — brand, hero, token, social, footer, holders labels, team, partners, API hints. |
| **`site-template/index.html`** | One-page layout: nav, hero, collections, token (`#xma`), holders, utilities, team, partners, footer. |
| **`site-template/css/styles.css`** | Dashboard styles. |
| **`site-template/js/app.js`** | Applies config, wallet/Discord, verify modal, chart, holders table. |
| **`site-template/server.js`** | Express: static files, Discord OAuth, game/holder/prices APIs used in development. |
| **`site-template/api/[[...path]].js`** | Vercel: static + API routing for the dashboard app. |
| **`site-template/assets/`** | Template assets (logo, hero, token art). Build can overwrite `public/assets/logo.png` from `images/logo.png`. |

## Build

From the **repo root**:

```bash
npm run build
```

This runs **`scripts/inject-env.js`**, which:

1. Copies **`site-template/`** `index.html`, `css/`, `js/`, `assets/` → **`public/`** (injects `__SITE_URL__` into `index.html`).
2. Copies root **`styles.css`** → **`public/styles.css`** (shared casino/game styling).
3. Copies game pages (`slots.html`, `chests.html`, `casino.html`, `roulette.html`, `coinflip.html`, …) and related JS → **`public/`**, injecting **`HELIUS_API_KEY`** into `chests.html` / `coinflip.html` when set.
4. Copies **`images/`** → **`public/images/`**.

After any change under **`site-template/`**, run **`npm run build`** before deploy or when testing the static output locally.

## Configuration

Edit **`site-template/js/config.js`**, then **`npm run build`**. Set secrets in **`.env`** (local) or Vercel: see root **`README.md`** for `DISCORD_*`, `SESSION_SECRET`, `HELIUS_API_KEY`, token/collection env vars.

## Casino / games

Hub and games are served from **`public/`** (`/casino`, `/slots`, `/chests`, `/roulette`, …). Route rewrites are in **`vercel.json`**. Source HTML/JS for many games stays at the **repo root** and is copied by the build step above.
