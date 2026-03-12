# Database Migration: Coin Flip Game

## Overview

The Coin Flip game uses two tables: `coinflip_players` (wallet state, flips remaining, totals) and `coinflip_rounds` (each flip: bet, prediction, result, payout).

## Prerequisites

- **schema.sql** must have been run at least once (it defines `update_updated_at_column()` used by the coinflip trigger).

## Steps

1. Open your Supabase project → **SQL Editor** (or use `psql` with your DB URL).
2. Run the migration file:
   - **migration_coinflip.sql**

That creates:

- `coinflip_players` – one row per wallet: `flips_remaining`, `cost_per_flip`, `total_wagered`, `total_won`, timestamps
- `coinflip_rounds` – one row per flip: `wallet_address`, `bet_amount`, `prediction`, `result`, `won_amount`, `created_at`
- Indexes and RLS policies so the API can read/write safely

## After Migration

- Coin Flip API routes (`/api/coinflip-state`, `/api/coinflip-purchase`, `/api/coinflip-flip`, etc.) will persist state and rounds in these tables.
- If you see an error like `function update_updated_at_column() does not exist`, run **schema.sql** first (or ensure that function exists in your DB).
