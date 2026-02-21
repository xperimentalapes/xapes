# Database Migration: Separate Slots and Roulette Tables

## Overview
Slots and roulette now use separate tables. Slots tables are renamed for clarity; roulette tables are new.

## Migration Order (run in sequence)

1. **migration_rename_slots_tables.sql**
   - Renames `players` → `slots_players`
   - Renames `game_history` → `slots_game_history`
   - Updates RLS policy names

2. **migration_create_roulette_tables.sql**
   - Creates `roulette_players` (same structure as slots_players)
   - Creates `roulette_game_history` (uses `result_number TEXT` instead of `result_symbols INTEGER[]`)

3. **migration_chest_rls.sql**
   - Enables Row Level Security on chest tables (`chest_opens_available`, `chest_purchase_txs`, `chest_reservations`)
   - Fixes UNRESTRICTED warnings

## Prerequisites

Run these **before** migration_rename_slots_tables.sql:
- schema.sql (or equivalent initial setup)
- migration_add_cost_per_spin.sql
- migration_add_spins_remaining.sql

## API Changes

- **save-game.js**: Accepts `gameType` in body (`'slots'` | `'roulette'`). Default: `'slots'`.
- **load-player.js**: Accepts `gameType` query param. Default: `'slots'`.
- **collect.js**: Accepts `gameType` in body. Default: `'slots'`.
- **confirm-collect.js**: Accepts `gameType` in body. Default: `'slots'`.
- **game-stats.js**: Uses `slots_players` (slots only).
- **leaderboard.js**: Uses `slots_players` (slots only).

## Frontend

- **slots.js**: Passes `gameType: 'slots'` to all API calls.
- **roulette.js**: Passes `gameType: 'roulette'` to all API calls.
