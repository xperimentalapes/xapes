# Holder verification, `nfts` index, Discord roles

## 1. Run SQL in Supabase

Execute `migration_holder_nfts_roles.sql` in the SQL editor.  
If `update_updated_at_column` does not exist yet, run the function from `schema.sql` first, or ignore the optional triggers block (it is skipped when the function is missing).

If you already created `nfts` before **Burn Squad** was added, run `migration_nfts_add_is_burn_squad.sql` once (`is_burn_squad BOOLEAN DEFAULT false`).

## 2. Env vars (Vercel + local `.env`)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Already used for games |
| `SUPABASE_SERVICE_KEY` | Server + Actions only (never expose to browser) |
| `HELIUS_API_KEY` | Already used |
| `MUTANT_APES_COLLECTION_MINT` | Collection to index and verify |
| `DISCORD_BOT_TOKEN` | Bot (Manage Roles; role below bot in Discord hierarchy) |
| `DISCORD_GUILD_ID` | Target server |

## 3. Seed `discord_roles`

Run **`database/seed_discord_roles_xapes.sql`** in the SQL editor (Xape Holder, God, Mutant, Royal Family, Cowboy DAO, Burn Squad, $XMA holder / whale).

Implemented `rule_type` values: `collection_min_one`, `collection_min_nfts`, `nft_column_true`, `token_balance_min`, `metadata_trait`.

## 4. GitHub Actions

Add the same secrets as in the workflow file (repo **Settings → Secrets and variables → Actions**).

## 5. Populate `nfts` (one-shot)

From the repo root, with `.env` containing `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `HELIUS_API_KEY`, and `MUTANT_APES_COLLECTION_MINT`:

```bash
npm run populate-nfts
```

This pulls every asset in the collection via Helius `getAssetsByGroup` (paginated), upserts into `nfts`, and removes rows for mints no longer returned (e.g. burned). It does **not** reconcile Discord roles; use `npm run sync-nfts` for that.

### Trait flags (Burn Squad / Crown / Cowboy)

Rules live in `lib/holder/trait-flags.js` (and `database/backfill_nft_trait_flags.sql` for SQL). Matching is **exact** on the attribute value (trim + case-insensitive), from `npm run extract-traits` → `database/trait_inventory_body_head.json`:

| Flag | `trait_type` | Value |
|------|----------------|-------|
| **Burn Squad** | Body | `Volcanic Ape` |
| **Crown** | Head, Hat, or Headwear | `Mutated Crown` |
| **Cowboy** | Head, Hat, or Headwear | `Mutant Cowboy` |

After changing rules or to fix existing rows, either run **`database/backfill_nft_trait_flags.sql`** in Supabase, or:

```bash
npm run backfill-trait-flags
```

## 6. API

- `POST /api/holder-link-wallet` — JSON `{ "walletAddress": "..." }`, requires Discord session cookie.
- `POST /api/holder-verify` — same; returns holdings + `rolesSynced`, `notInGuild`, `message`, etc.

Slash aliases `/api/holder/link-wallet` and `/api/holder/verify` work on the Node server locally.
