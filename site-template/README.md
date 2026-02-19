# NFT & Token site template

Self-contained folder you can **copy into another project** to run the same site (collections, token, holders, team, Discord, verify) for that project.

## How to use in another project

### 1. Copy this folder

- Copy the entire **`site-template`** folder into your target project (e.g. `my-project/site/` or use it as the project root).

### 2. Install and env

```bash
cd site-template   # or your project root if you copied contents there
npm install
cp .env.example .env
```

Edit **`.env`**: set `BASE_URL`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, optional `DISCORD_BOT_TOKEN`, `HELIUS_API_KEY`, `XMA_TOKEN_MINT` (or `BLUNA_TOKEN_MINT` / `TOKEN_MINT`), and any collection mints.

### 3. Set your project config

Edit **`js/config.js`** and replace all values:

- **Brand:** `projectName`, `tagline`, `logoUrl`
- **Social:** `social.x`, `social.discord`; optional `shopUrl`
- **Token:** `token.name`, `symbol`, `logoUrl`, `priceLabel`, `chartLabel`, `summaryText`
- **Hero:** `hero.title`, `tagline`, `subtitle`; background image paths if you use custom ones
- **Footer:** `footerCopy`
- **Partners:** `partnersLead`, `partnersPlaceholder`
- **Holders:** `holdingsLabels` (token + collection names), `holdersLead`, `holdersSortOptions` — keys should match your server collections (see `server.js` `COLLECTIONS` or env).
- **Team:** `team` array of `{ xProfileUrl, discordId, description }`
- **API:** `tokenMint`, `collections` (and holder portal URLs if you use them)

### 4. Add assets

Put your assets in **`assets/`**:

- **`logo.png`** — project logo (sidebar, footer, nav)
- **`hero-bg.png`** — hero background (desktop/landscape)
- **`hero-bg-portrait.png`** — hero background (mobile portrait)
- **`token.png`** — token logo (or set `token.logoUrl` in config to a full URL)

### 5. Server collections (optional)

In **`server.js`**, the `COLLECTIONS` array (and token mint) can be driven by env. Set `XMA_TOKEN_MINT` (or `BLUNA_TOKEN_MINT` / `TOKEN_MINT`) and e.g. `MUTANT_APES_COLLECTION_MINT`, `COLLECTION_ME_SLUG` for your collections, or edit `COLLECTIONS` to match your slugs/names. Keep the same keys as in `holdingsLabels` / `holdersSortOptions` so labels stay in sync.

### 6. Run

```bash
npm start
```

Open `http://localhost:3000` (or your `PORT`). For production, deploy (e.g. Vercel); the `vercel-build` script copies static files into `api/static`.

---

**Summary:** Copy folder → `npm install` → copy `.env.example` to `.env` and fill → edit `js/config.js` → add `assets/` → run or deploy.
