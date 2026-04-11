# Homepage (dashboard) setup

The marketing/dashboard site and casino page sources live under **`apps/web/`**. Vercel and local **`npm start`** serve the built copy under **`public/`** (after **`npm run build`**).

## Layout

| Path | Purpose |
|------|--------|
| **`apps/web/js/config.js`** | `window.XAPES_CONFIG` — brand, hero, token, social, footer, holders labels, team, partners, API hints. |
| **`apps/web/index.html`** | One-page layout: nav, hero, collections, token (`#xma`), holders, utilities, team, partners, footer. |
| **`apps/web/css/styles.css`** | Dashboard styles. |
| **`apps/web/js/app.js`** | Applies config, wallet/Discord, verify modal, chart, holders table. |
| **`apps/web/server.js`** | Express: static files, Discord OAuth, game/holder/prices APIs used in development. |
| **`apps/web/api/[[...path]].js`** | Optional Vercel-style static + API routing (see `api/dashboard.js` for production rewrites). |
| **`apps/web/assets/`** | Dashboard assets (logo, hero, token art). Build can overwrite `public/assets/logo.png` from `images/logo.png`. |
| **`apps/web/games/`** | Casino hub + games: HTML, JS, and shared/per-game CSS copied flat into `public/`. |

## Build

From the **repo root**:

```bash
npm run build
```

This runs **`scripts/inject-env.js`**, which:

1. Copies **`apps/web/`** `index.html`, `css/`, `js/`, `assets/` → **`public/`** (injects `__SITE_URL__` into `index.html`).
2. Copies **`apps/web/games/`** (e.g. `styles.css`, `slots.html`, `chests.html`, `casino.html`, `roulette.html`, `coinflip.html`, matching JS/CSS) → **`public/`**, injecting **`HELIUS_API_KEY`** into `chests.html` / `coinflip.html` when set.
3. Copies **`images/`** → **`public/images/`**.

After any change under **`apps/web/`**, run **`npm run build`** before deploy or when testing the static output locally.

## Configuration

Edit **`apps/web/js/config.js`**, then **`npm run build`**. Set secrets in **`.env`** (local) or Vercel: see root **`README.md`** for `DISCORD_*`, `SESSION_SECRET`, `HELIUS_API_KEY`, token/collection env vars.

## Casino / games

Hub and games are served from **`public/`** (`/casino`, `/slots`, `/chests`, `/roulette`, …). Route rewrites are in **`vercel.json`**. Source files live in **`apps/web/games/`** and are flattened into **`public/`** by the build step above.
