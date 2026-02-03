# Database Migration: Add spins_remaining Column

## Overview
We've added a `spins_remaining` column to track unused spins that persist across page refreshes.

## Migration Steps

1. **Go to Supabase SQL Editor**
   - Open your Supabase dashboard
   - Navigate to SQL Editor

2. **Run the Migration SQL**
   - Copy and paste the contents of `database/migration_add_spins_remaining.sql`
   - Click "Run"

   The SQL will:
   - Add `spins_remaining` column to `players` table
   - Set existing players to 0 (they'll need to purchase new spins)

## What's Changed

### Database Schema
- Added `spins_remaining INTEGER DEFAULT 0` to `players` table

### API Changes
- `save-game.js`: Now tracks spins remaining (increments on purchase, decrements on use)
- `load-player.js`: Now returns `spinsRemaining` in response

### Frontend Changes
- `loadPlayerData()`: Restores `spinsRemaining` from database on page load
- `purchaseSpins()`: Saves spins purchase to database
- `spin()`: Saves updated spins remaining after each spin

## Testing

After running the migration:

1. Purchase some spins
2. Check Supabase `players` table - `spins_remaining` should show the number
3. Play a spin
4. Check database - `spins_remaining` should decrement
5. Refresh the page
6. Your spins remaining should restore from database

## Notes

- Existing players will have `spins_remaining = 0` after migration
- They'll need to purchase new spins to have any remaining
- New players will start with `spins_remaining = 0` until they purchase
