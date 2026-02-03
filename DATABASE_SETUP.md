# Database Setup Instructions

## Overview
We're using Supabase (PostgreSQL) to store player data, game history, and leaderboard information.

## Setup Steps

1. **Create Supabase Account**
   - Go to https://supabase.com
   - Sign up for free account
   - Create a new project

2. **Get API Credentials**
   - Go to Project Settings > API
   - Copy your:
     - Project URL
     - `anon` public key (for frontend)
     - `service_role` key (for backend - keep secret!)

3. **Set Environment Variables in Vercel**
   - Go to your Vercel project settings
   - Add these environment variables:
     - `SUPABASE_URL` = Your project URL
     - `SUPABASE_ANON_KEY` = Your anon public key
     - `SUPABASE_SERVICE_KEY` = Your service_role key (for serverless functions)

4. **Run SQL to Create Tables**
   - Go to Supabase SQL Editor
   - Run the SQL from `database/schema.sql`

## Database Schema

### `players` table
- `wallet_address` (text, primary key) - Player's Solana wallet address
- `total_spins` (integer) - Total number of spins played
- `total_won` (bigint) - Total coins won (in smallest unit, 6 decimals)
- `total_wagered` (bigint) - Total coins wagered
- `unclaimed_rewards` (bigint) - Current unclaimed rewards
- `created_at` (timestamp) - When player first played
- `updated_at` (timestamp) - Last update time

### `game_history` table
- `id` (bigserial, primary key) - Unique game ID
- `wallet_address` (text, foreign key) - Player wallet
- `spin_cost` (bigint) - Cost of the spin
- `result_symbols` (integer[]) - Array of 3 symbol indices
- `won_amount` (bigint) - Amount won (0 if lost)
- `timestamp` (timestamp) - When spin occurred

## Indexes
- Index on `players.wallet_address` (primary key, automatic)
- Index on `game_history.wallet_address` (for fast lookups)
- Index on `game_history.timestamp` (for leaderboard queries)
