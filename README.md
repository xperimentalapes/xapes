# XapeLabz / Xperimental Mutant Apes (`xapes`)

Monorepo for **XapeLabz**: marketing dashboard, **$XMA** token tooling, **Discord** (OAuth + slash commands), **Supabase** holder/NFT data, and **casino** pages (slots, chests, roulette, coinflip) deployed on **Vercel**.

## Quick start

```bash
npm install
# Create a root `.env` with the variables listed below (never commit secrets).
npm run build          # copies `apps/web/` (dashboard + `games/`) into `public/` and injects env into HTML where needed
npm start              # Express: `apps/web/server.js` on PORT (default 3000)
# or: npm run dev      # build + start in one step
```

Open [http://localhost:3000](http://localhost:3000). The live site is produced from **`public/`** after `npm run build`; local `npm start` also serves game assets from `public/`.

## Stack

| Area | Location |
|------|-----------|
| Dashboard (hero, collections, `#xma` token section, holders, team, Discord connect) | `apps/web/` → copied to `public/` by build |
| Express API (Discord OAuth, prices, holders, Birdeye OHLC, games, holder verify) | `apps/web/server.js`; Vercel entry `api/dashboard.js` |
| Discord slash commands | `lib/discord/*`, `POST /api/discord/interactions` |
| Holder sync + roles | `lib/holder/*`, `scripts/sync-nfts-roles.js`, cron `GET /api/cron/sync-nfts` ([cron-job.org](docs/deploy-cron-jobs.md)) |
| Casino game pages (HTML, JS, CSS) | `apps/web/games/` → copied into `public/` by `scripts/inject-env.js` |
| On-chain slot program (Anchor) | `slot-machine/` |

## Environment variables

Set in **Vercel → Project → Settings → Environment Variables** (and locally in `.env`).

**Site / Discord**

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — OAuth “Connect Discord”
- `SESSION_SECRET` — cookie-session signing
- `DISCORD_BOT_TOKEN` — team avatars, slash-command follow-ups, role sync
- `DISCORD_PUBLIC_KEY` — **required** for `POST /api/discord/interactions`
- `DISCORD_GUILD_ID` — guild slash command registration (`npm run register-discord-commands`)
- `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_ID` — same app as the bot
- `DISCORD_ADMIN_ROLE_IDS` — optional comma-separated role IDs for `/my_* member:` option

**Data / chain**

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `HELIUS_API_KEY` — NFT sync + balances
- `MUTANT_APES_COLLECTION_MINT`, `COLLECTION_NAME`, `COLLECTION_ME_SLUG` (optional)
- `XMA_TOKEN_MINT` (and optional `BLUNA_TOKEN_MINT` / `TOKEN_MINT` aliases)
- `BIRDEYE_API_KEY` — optional; token OHLC chart (`/api/xma-ohlc`)

**Scheduled jobs (cron-job.org → Vercel `/api/cron/*`)**

- `CRON_SECRET` — bearer token for cron HTTP endpoints ([setup guide](docs/deploy-cron-jobs.md))
- Accrual / settlement / NFT sync use existing Supabase, Helius, Discord env vars above

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | `scripts/inject-env.js` — refresh `public/` dashboard + games |
| `npm start` | Local Express server |
| `npm run sync-nfts` | Helius → `nfts` table + Discord role reconciliation |
| `npm run populate-nfts` | Populate `nfts` (no full role pass) |
| `npm run register-discord-commands` | Register guild slash commands from `lib/discord/command-definitions.js` |
| `npm run seed-discord-roles` | Seed `discord_roles` (see `database/`) |

## Project layout (abbrev.)

```
xapes/
├── apps/
│   └── web/             # Dashboard source + Express server; `games/` = casino HTML/JS/CSS
├── public/              # Deployed static output (run `npm run build` to refresh)
├── api/                 # Vercel serverless handlers (dashboard, games, chests, etc.)
├── lib/                 # discord/, holder/, coinflip/
├── scripts/             # build, sync, DB helpers, `solana-*.js` key utilities
├── database/            # SQL migrations and notes
├── slot-machine/        # Anchor program + app for on-chain slots
└── vercel.json          # rewrites → `api/dashboard` + static routes
```

## Configuration

Front-end copy, links, team Discord IDs, and token labels live in **`apps/web/js/config.js`** as `window.XAPES_CONFIG`. After edits, run **`npm run build`** so `public/js/config.js` updates.

## Docs

- **`HOMEPAGE_SETUP.md`** — how the dashboard template is wired
- **`DATABASE_SETUP.md`** / **`database/`** — Supabase schema and migrations
- **`DEPLOYMENT.md`** — Vercel-focused notes
- **`docs/deploy-cron-jobs.md`** — cron-job.org schedules for XMA accrual, settlement, NFT sync
- **`SECURITY.md`** — operational security reminders

## License / usage

Site and tooling for the **Xperimental Mutant Apes / XapeLabz** project. Adjust branding and env for your deployment.
