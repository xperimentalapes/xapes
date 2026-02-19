# New Homepage Setup — Template Review & Implementation

## 1. Site template overview

**`site-template/`** is a self-contained NFT & token site. You customise it via **project config** and assets only.

| Path | Purpose |
|------|--------|
| **`js/config.js`** | Single source of copy and URLs: `window.MNK3YS_CONFIG` — brand, hero, token, social, footer, holders labels, team, partners, API endpoints. |
| **`index.html`** | One-page layout: sticky social, side/bottom nav, hero, Collections, Token (blunana), Holders, Utilities, Team, Partners, footer. All text/URLs filled by `app.js` from config. |
| **`css/styles.css`** | Template styles (Space Grotesk, dashboard, sections, cards). |
| **`js/app.js`** | Config-driven UI: applies config to DOM, wallet/Discord connect, verify modal, holdings, token chart, holders table. |
| **`server.js`** | Express: static files, Discord OAuth, `/api/discord/*`, `/api/collections`, `/api/holdings`, token price/OHLC. |
| **`api/`** | Vercel serverless: `[[...path]].js` serves static + proxies to Express-style API; `discord/*`, favicon. |
| **`assets/`** | You supply: `logo.png`, `hero-bg.png`, `hero-bg-portrait.png`, `token.png`. |
| **`.env.example`** | Env: `BASE_URL`, `SESSION_SECRET`, `DISCORD_*`, `HELIUS_API_KEY`, `TOKEN_MINT`, collection mints. |
| **`scripts/copy-static.js`** | Vercel build: copies `index.html`, `css/`, `js/`, `assets/` into `api/static`. |

**Customisation flow:** Edit `js/config.js` → set project name, tagline, logo, hero, token (XMA), social, footer, holdings labels, team, partners, tokenMint, collections. Add assets. Env for API/backend. No need to edit HTML structure unless you add/remove sections.

---

## 2. Current site vs goal

**Remove from main domain (this repo):**
- Current homepage: `index.html`, hero/about/marketplace/utilities/community sections, and the global marketing styles that only serve that page (`styles.css` hero, about, utilities, etc.).
- Any links/nav that point only at those sections.

**Keep (until casino has its own domain):**
- Casino hub and games: `/casino`, `/slots`, `/chests`, `/roulette` and their assets, CSS, JS, and APIs (e.g. chest APIs, slots, collect, etc.).
- `vercel.json` rewrites for those routes so they keep working.

**Goal:** Replace the main site with the template-driven homepage; keep casino routes here unchanged for now. Later, casino gets its own domain and can be split out.

---

## 3. Implementation plan

### Phase A — Wire template as the new homepage

1. **Merge strategy:** Use template as the new root homepage.
   - **Option A (recommended):** Build outputs template into `public/`: run template’s `copy-static.js` (or equivalent) so `public/index.html`, `public/css/`, `public/js/`, `public/assets/` come from `site-template/`. Existing build continues to copy `slots.html`, `chests.html`, `casino.html`, etc. into `public/` so `/casino`, `/slots`, `/chests` keep working.
   - **Option B:** Move template files to repo root (new `index.html`, `css/`, `js/`, `assets/`) and replace current root `index.html`; adjust build to copy game pages and shared assets into `public/` as now.

2. **XMA config** in `site-template/js/config.js` (or root `js/config.js` if Option B):
   - **Brand:** `projectName` (e.g. Xperimental Mutant Apes), `tagline`, `logoUrl`.
   - **Social:** `social.x`, `social.discord`; `shopUrl` if needed.
   - **Token:** `token.name` (XMA), `symbol`, `logoUrl`, `priceLabel`, `chartLabel`, `summaryText`.
   - **Hero:** `hero.title`, `tagline`, `subtitle`; `backgroundImage`, `backgroundImagePortrait` (paths to assets).
   - **Footer:** `footerCopy`.
   - **Partners / Holders:** `partnersLead`, `partnersPlaceholder`; `holdingsLabels`, `holdersLead`, `holdersSortOptions` (keys matching server/API collections).
   - **Team:** `team` array.
   - **API:** `tokenMint`, `collections`, `endpoints` (holdings, discordAuth).

3. **Assets:** Add to template `assets/` (or root `assets/` if Option B): logo, hero backgrounds, token image. Reuse from current site where possible (e.g. `public/images/logo.png` → `assets/logo.png`).

4. **Env:** `.env` and Vercel: `BASE_URL`, `SESSION_SECRET`, `DISCORD_*`, `HELIUS_API_KEY`, `TOKEN_MINT`, collection mints. Align with template’s `server.js` / `api/` expectations.

### Phase B — Build and routing

5. **Build:**
   - If Option A: extend `scripts/inject-env.js` (or add a step) to run template’s copy-static into `public/` so `index.html` + `css/` + `js/` + `assets/` are the template; keep copying game pages and any shared images into `public/`.
   - Ensure `public/` ends up with: new `index.html` (template), `css/`, `js/`, `assets/`, plus `slots.html`, `chests.html`, `casino.html`, `roulette.html`, and their CSS/JS and `images/` etc.

6. **Routing:** Keep `vercel.json` as-is for game routes: `/casino` → `casino.html`, `/slots` → `slots.html`, etc. Root `/` serves the new template `index.html`.

7. **Casino CTA:** On the new homepage hero (or a clear CTA), add a link/button “Play Royal Casino” → `/casino` (or future casino domain URL in config).

### Phase C — Later (casino own domain)

8. When casino has its own domain: deploy casino + games there; this repo can remove game pages and casino routes or keep them as redirects.

---

## 4. Decisions to make before coding

| # | Decision | Options |
|---|----------|--------|
| 1 | **Merge style** | (A) Template builds into `public/`, current build copies games into `public/`; (B) Template at repo root, replace current index. |
| 2 | **Asset paths** | Use template default `assets/` under template (or root) vs keep some in `public/images/` and reference from config. |
| 3 | **Collections / token** | Which Solana collections and token mint for Holders + token section (match `server.js` / env). |
| 4 | **Discord / verify** | Enable template Discord OAuth and “Verify holdings” from day one, or disable/hide until ready. |

---

## 5. Next step

Once you choose:
- **Merge style** (A or B),
- **Asset location**,
- **Whether to enable Discord/verify now**,

we can implement Phase A (config + assets + env) and Phase B (build + routing + casino CTA) step by step.
