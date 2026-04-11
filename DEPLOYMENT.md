# Deployment (Vercel)

This project is configured for **Vercel**: `vercel.json` sets `buildCommand` to `npm run build` and `outputDirectory` to `public`.

1. Connect the GitHub repo to Vercel (or use `vercel` CLI from the repo root).
2. Add **environment variables** in the Vercel project (see root **README.md**).
3. Deploy. Each build runs `npm run build`, which refreshes `public/` from **`apps/web/`** (dashboard + **`apps/web/games/`**).

**Discord OAuth:** Register every production callback URL, e.g. `https://your-domain.com/api/discord/callback`, in the Discord Developer Portal (same for `www` if you use it).

**Discord interactions:** Set the interactions URL to `https://your-domain.com/api/discord/interactions` and set `DISCORD_PUBLIC_KEY` in Vercel.

For local production-like checks: `npm run build && npm start`.
