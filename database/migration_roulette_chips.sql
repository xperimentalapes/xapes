-- Migration: Roulette uses chips not spins
-- Add chips_balance and cost_per_chip, migrate from spins_remaining/cost_per_spin, then drop old columns

-- Add new columns
ALTER TABLE roulette_players ADD COLUMN IF NOT EXISTS chips_balance BIGINT DEFAULT 0;
ALTER TABLE roulette_players ADD COLUMN IF NOT EXISTS cost_per_chip NUMERIC(20,6) DEFAULT 1;

-- Migrate existing data: 1 spin = 100 chips, cost_per_chip = cost_per_spin/100
UPDATE roulette_players
SET chips_balance = COALESCE(spins_remaining, 0) * 100,
    cost_per_chip = COALESCE(cost_per_spin, 100) / 100.0
WHERE chips_balance IS NULL OR chips_balance = 0;

-- Drop old columns
ALTER TABLE roulette_players DROP COLUMN IF EXISTS spins_remaining;
ALTER TABLE roulette_players DROP COLUMN IF EXISTS cost_per_spin;
