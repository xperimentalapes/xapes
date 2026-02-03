-- Migration: Add spins_remaining column to players table
-- Run this if you already have the players table

ALTER TABLE players 
ADD COLUMN IF NOT EXISTS spins_remaining INTEGER DEFAULT 0;

-- Update existing rows to calculate spins_remaining from game_history
-- spins_remaining = total_spins_purchased - total_spins_played
-- For now, set to 0 for existing players (they'll need to purchase new spins)
UPDATE players SET spins_remaining = 0 WHERE spins_remaining IS NULL;
